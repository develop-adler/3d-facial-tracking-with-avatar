import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
// import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { HavokPhysicsWithBindings, HP_BodyId, HP_ShapeId, MotionType } from "@babylonjs/havok";
import {
  Euler,
  type InstancedMesh,
  type Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from "three";

import type { PhysicsBody } from "@/utils/three/havok/physicsBody";
import { PhysicsShape, type PhysicShapeOptions } from "@/utils/three/havok/physicsShape";
import { HavokPlugin } from "@/utils/three/havok/havokPlugin";

type PhysicsObject = PhysicsInstancedObject & { mesh: Mesh; dynamic: boolean };
type PhysicsInstancedObject = { offset: number; body: HP_BodyId };
// NEW: Options for creating complex bodies
type ComplexBodyOptions = {
  mass?: number;
  restitution?: number;
  staticFriction?: number;
  dynamicFriction?: number;
  type?: MotionType;
}

// const VECTOR_ZERO = new Vector3(0, 0, 0);
// const VECTOR_ONE = new Vector3(1, 1, 1);
// // const GRAVITY = new Vector3(0, -9.81, 0);
// const EULER_ZERO = new Euler(0, 0, 0);
// const EULER_ONE = new Euler(1, 1, 1);

export default class HavokPhysics {
  readonly engine: HavokPhysicsWithBindings; // Awaited<ReturnType<typeof HavokEngine>>;
  readonly havokPlugin: HavokPlugin;
  private readonly instancedObjects: Map<
    InstancedMesh,
    PhysicsInstancedObject[]
  > = new Map();

  readonly objects: PhysicsObject[] = [];
  physicsBodies: Array<PhysicsBody> = [];
  private instancedArray!: Float32Array;

  // =================================================================
  // NEW: Shape Caching
  // We use the geometry's UUID as a key to store and reuse shapes.
  // This prevents re-calculating complex shapes for the same model.
  // =================================================================
  private readonly shapeCache: Map<string, HP_ShapeId> = new Map();

  constructor(engine: HavokPhysicsWithBindings, gravity: Vector3) {
    this.engine = engine;
    this.havokPlugin = new HavokPlugin(true, engine);
    this.engine.HP_World_SetGravity(this.world, gravity.toArray());
  }

  get world() {
    return this.havokPlugin.world;
  }

  createBody(mesh: Mesh, shape: PhysicsShape): HP_BodyId {
    const body = this.engine.HP_Body_Create()[1];

    const worldPosition = new Vector3();
    mesh.getWorldPosition(worldPosition);
    const worldQuaternion = new Quaternion();
    mesh.getWorldQuaternion(worldQuaternion);
    const scale = new Vector3();
    mesh.getWorldScale(scale);

    this.engine.HP_Body_SetShape(
      body,
      shape._pluginData[1]
    );

    return body;
  }

  createShape(mesh: Mesh, shapeType: PhysicsShapeType, options: PhysicShapeOptions): PhysicsShape {
    const shape = new PhysicsShape({
      type: shapeType,
      ...options
    }, this.havokPlugin);
    return shape;
  }

  private createBoxBody(
    position: Vector3,
    rotation: Euler,
    scale: Vector3,
    type: MotionType = this.engine.MotionType.STATIC
  ): PhysicsInstancedObject {
    const body = this.engine.HP_Body_Create()[1];
    const qRotation = new Quaternion().setFromEuler(rotation);

    this.engine.HP_Body_SetShape(
      body,
      this.engine.HP_Shape_CreateBox(
        [0, 0, 0],
        [0, 0, 0, 1],
        [scale.x, scale.y, scale.z]
      )[1]
    );

    this.engine.HP_Body_SetQTransform(body, [
      [position.x, position.y, position.z],
      [qRotation.x, qRotation.y, qRotation.z, qRotation.w],
    ]);

    this.engine.HP_World_AddBody(this.world, body, false);
    const offset = this.engine.HP_Body_GetWorldTransformOffset(body)[1];
    this.engine.HP_Body_SetMotionType(
      body,
      this.engine.MotionType[
      type as unknown as keyof typeof this.engine.MotionType
      ]
    );

    return { offset, body };
  }

  private updateBodyMaterial(
    body: HP_BodyId,
    restitution: number,
    staticFriction?: number,
    dynamicFriction = staticFriction,
  ): this {
    const shape = this.engine.HP_Body_GetShape(body)[1];
    const material = this.engine.HP_Shape_GetMaterial(shape)[1];

    if (staticFriction) material[0] = staticFriction;
    if (dynamicFriction) material[1] = dynamicFriction;

    material[2] = restitution;

    this.engine.HP_Shape_SetMaterial(shape, material);

    return this;
  }

  private updateBodyMass(body: HP_BodyId, mass: number): this {
    const massProperties = this.engine.HP_Body_GetMassProperties(body)[1];
    massProperties[1] = mass;
    this.engine.HP_Body_SetMassProperties(body, massProperties);
    return this;
  }

  public createBox(mesh: Mesh, options: ComplexBodyOptions = {}): void {
    const { type = this.engine.MotionType.STATIC } = options;
    const scale = new Vector3();
    mesh.getWorldScale(scale);

    const boxShape = this.engine.HP_Shape_CreateBox(
      [0, 0, 0],
      [0, 0, 0, 1],
      scale.toArray(),
    )[1];

    this.createBodyFromShape(mesh, boxShape, {
      ...options,
      type,
    });
  }

  /**
   * Creates a dynamic physics body with a Convex Hull shape.
   * Ideal for dynamic objects that need to tumble and collide accurately.
   * @param object The THREE.Object3D (Mesh or Group) to base the shape on.
   * @param options Physics properties for the body.
   */
  public createConvexHull(
    object: Object3D,
    options: ComplexBodyOptions = {},
  ): void {
    const mergedGeometry = this.createMergedGeometry(object);
    // Use the object's UUID for caching, so we don't re-merge and re-create
    // for the same top-level object.
    const cacheKey = `${object.userData.id}_convex`;

    let shapeId = this.shapeCache.get(cacheKey);
    if (!shapeId) {
      shapeId = this.createConvexHullShape(mergedGeometry);
      this.shapeCache.set(cacheKey, shapeId);
    }

    this.createBodyFromShape(object as Mesh, shapeId, options);
  }

  /**
   * Creates a static physics body with a Triangle Mesh shape.
   * Ideal for static, complex environments like terrain or architecture.
   * Using this for dynamic objects is not recommended due to performance.
   * @param object The THREE.Object3D (Mesh or Group) to base the shape on.
   * @param options Physics properties for the body.
   */
  public createTrimesh(
    object: Object3D,
    options: ComplexBodyOptions = {},
  ): void {
    const mergedGeometry = this.createMergedGeometry(object);
    const cacheKey = `${object.userData.id}_trimesh`;

    let shapeId = this.shapeCache.get(cacheKey);
    if (!shapeId) {
      shapeId = this.createTrimeshShape(mergedGeometry);
      this.shapeCache.set(cacheKey, shapeId);
    }

    // Trimesh bodies should always be static
    const finalOptions = { ...options, type: this.engine.MotionType.STATIC };
    this.createBodyFromShape(object as Mesh, shapeId, finalOptions);
  }

  // =================================================================
  // NEW: Core logic for shape creation from BufferGeometry
  // =================================================================

  /**
   * Creates a single, merged BufferGeometry from a complex Object3D.
   * This is the first step for creating a single physics shape for a model.
   */
  private createMergedGeometry(object: Object3D): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    object.updateWorldMatrix(true, false);

    object.traverse((child) => {
      if (child.type === "Mesh" && (child as Mesh).geometry) {
        const clonedGeom = (child as Mesh).geometry.clone();
        // We must apply the world matrix of each mesh to get the
        // vertices in the correct position relative to the group.
        clonedGeom.applyMatrix4(child.matrixWorld);
        geometries.push(clonedGeom);
      }
    });

    if (geometries.length === 0) {
      throw new Error(
        "No geometries found in the provided Object3D for physics shape creation.",
      );
    }

    // We merge all geometries into a single one.
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(
      geometries,
      true,
    ); // Set second param to true to create indexed geometry

    // We must "un-apply" the parent's matrix to bring the vertices
    // back to the object's local space. The physics body's transform
    // will handle the world position.
    const inverseMatrix = object.matrixWorld.clone().invert();
    mergedGeometry.applyMatrix4(inverseMatrix);

    return mergedGeometry;
  }

  /**
   * Creates a Havok Convex Hull shape from a BufferGeometry.
   * @param geometry The BufferGeometry to use.
   * @returns The Havok shape ID (HP_ShapeId).
   */
  private createConvexHullShape(geometry: BufferGeometry): HP_ShapeId {
    const vertices = geometry.getAttribute("position").array as Float32Array;
    const numVertices = vertices.length / 3;

    // Allocate memory inside the WASM module
    const vertexDataPtr = this.engine._malloc(vertices.byteLength);
    // Copy the vertex data into the WASM heap
    this.engine.HEAPF32.set(vertices, vertexDataPtr / 4);

    const [result, shapeId] = this.engine.HP_Shape_CreateConvexHull(
      vertexDataPtr,
      numVertices,
    );

    // Free the allocated memory
    this.engine._free(vertexDataPtr);

    if (result !== this.engine.Result.RESULT_OK) {
      throw new Error("Havok: Failed to create Convex Hull shape.");
    }

    return shapeId;
  }

  /**
   * Creates a Havok Triangle Mesh shape from a BufferGeometry.
   * @param geometry The BufferGeometry to use. Must be indexed.
   * @returns The Havok shape ID (HP_ShapeId).
   */
  private createTrimeshShape(geometry: BufferGeometry): HP_ShapeId {
    if (!geometry.index) {
      throw new Error(
        "Havok: Trimesh shape requires an indexed BufferGeometry.",
      );
    }

    const vertices = geometry.getAttribute("position").array as Float32Array;
    const indices = geometry.index.array as Uint32Array | Uint16Array;
    const numVertices = vertices.length / 3;
    const numTriangles = indices.length / 3;

    // Havok expects 32-bit integers for indices.
    const indices32 =
      indices instanceof Uint32Array
        ? indices
        : new Uint32Array(indices);

    // Allocate memory for vertices and indices in WASM
    const vertexDataPtr = this.engine._malloc(vertices.byteLength);
    const indexDataPtr = this.engine._malloc(indices32.byteLength);

    // Copy data to the WASM heap
    this.engine.HEAPF32.set(vertices, vertexDataPtr / 4);
    this.engine.HEAPU32.set(indices32, indexDataPtr / 4);

    const [result, shapeId] = this.engine.HP_Shape_CreateMesh(
      vertexDataPtr,
      numVertices,
      indexDataPtr,
      numTriangles,
    );

    // Free the allocated memory
    this.engine._free(vertexDataPtr);
    this.engine._free(indexDataPtr);

    if (result !== this.engine.Result.RESULT_OK) {
      throw new Error("Havok: Failed to create Trimesh shape.");
    }

    return shapeId;
  }

  // =================================================================
  // NEW: Generic body creation function to reduce code duplication
  // =================================================================
  private createBodyFromShape(
    mesh: Mesh,
    shapeId: HP_ShapeId,
    options: ComplexBodyOptions,
  ): void {
    const {
      mass = 1,
      restitution = 0.5,
      staticFriction = 0.5,
      dynamicFriction = 0.5,
      type = this.engine.MotionType.DYNAMIC,
    } = options;

    const body = this.engine.HP_Body_Create()[1];

    // Set shape
    this.engine.HP_Body_SetShape(body, shapeId);

    // Set initial transform from the mesh
    const worldPosition = new Vector3();
    mesh.getWorldPosition(worldPosition);
    const worldQuaternion = new Quaternion();
    mesh.getWorldQuaternion(worldQuaternion);

    this.engine.HP_Body_SetQTransform(body, [
      worldPosition.toArray(),
      worldQuaternion.toArray(),
    ]);

    // Set motion type and add to world
    this.engine.HP_Body_SetMotionType(body, type);
    this.engine.HP_World_AddBody(this.world, body, false);

    const offset = this.engine.HP_Body_GetWorldTransformOffset(body)[1];
    const dynamic = type !== this.engine.MotionType.STATIC;

    // Set material and mass properties for dynamic bodies
    if (dynamic) {
      this.updateBodyMaterial(
        body,
        restitution,
        staticFriction,
        dynamicFriction,
      );
      this.updateBodyMass(body, mass);
    }

    this.objects.push({ mesh, dynamic, offset, body });
  }

  /**
   * Removes a body from the world. To dispose of a body, it is necessary to remove it from the world first.
   *
   * @param body - The body to remove.
   */
  removeBody(body: PhysicsBody) {
    if (body._pluginDataInstances && body._pluginDataInstances.length > 0) {
      for (const instance of body._pluginDataInstances) {
        this.engine.HP_World_RemoveBody(this.world, instance.hpBodyId);
        this.physicsBodies.splice(this.physicsBodies.indexOf(instance), 1);
      }
    }
    if (body._pluginData) {
      this.engine.HP_World_RemoveBody(this.world, body._pluginData.hpBodyId);
      this.physicsBodies.splice(this.physicsBodies.indexOf(body), 1);
    }
  }

  public update(deltaTime: number): void {
    this.engine.HP_World_Step(this.world, deltaTime);

    const bodyBuffer = this.engine.HP_World_GetBodyBuffer(this.world)[1];

    for (let o = this.objects.length; o--;) {
      const object = this.objects[o];

      const transformBuffer = new Float32Array(
        this.engine.HEAPU8.buffer,
        bodyBuffer + object.offset,
        16
      );

      for (let i = 0; i < 15; i++)
        if ((i & 3) !== 3) object.mesh.matrix.elements[i] = transformBuffer[i];

      if (!object.dynamic) continue;

      const transform = this.engine.HP_Body_GetQTransform(object.body)[1];

      // sync scene objects
      object.mesh.quaternion.fromArray(transform[1]);
      object.mesh.position.fromArray(transform[0]);
    }

    // eslint-disable-next-line unicorn/no-array-for-each
    this.instancedObjects.forEach((objects, mesh) => {
      this.instancedArray.set(mesh.instanceMatrix.array);

      for (let o = objects.length; o--;) {
        const object = objects[o],
          offset = o * 16;

        const transformBuffer = new Float32Array(
          this.engine.HEAPU8.buffer,
          bodyBuffer + object.offset,
          16
        );

        for (let i = 0; i < 15; i++)
          if ((i & 3) !== 3)
            this.instancedArray[offset + i] = transformBuffer[i];

        mesh.instanceMatrix.copyArray(this.instancedArray);
      }

      mesh.instanceMatrix.needsUpdate = true;
    });

    console.log("update physics");
  }
  /**
     * Releases a cached shape from memory.
     * Call this if you know a specific geometry will no longer be used.
     * @param cacheKey The key used for caching (e.g., `${object.uuid}_convex`).
     */
  public releaseCachedShape(cacheKey: string): void {
    const shapeId = this.shapeCache.get(cacheKey);
    if (shapeId) {
      this.engine.HP_Shape_Release(shapeId);
      this.shapeCache.delete(cacheKey);
    }
  }

  /**
   * Clears the entire shape cache and releases all cached shapes.
   */
  public clearShapeCache(): void {
    for (const [, shapeId] of this.shapeCache) {
      this.engine.HP_Shape_Release(shapeId);
    }
    this.shapeCache.clear();
  }

  dispose(): void {
    this.havokPlugin.dispose();
  }
}
