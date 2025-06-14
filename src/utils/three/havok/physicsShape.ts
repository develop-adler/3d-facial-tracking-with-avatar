/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
    PhysicsMaterial,
    PhysicsShapeType,
} from "@babylonjs/core/Physics/v2";
import type { HavokPhysicsWithBindings, Quaternion as QuaternionHavok, QSTransform, Vector3 as Vector3Havok } from "@babylonjs/havok";
import { Vector3, Quaternion, type Object3D, type Mesh, Matrix4, type InstancedMesh } from "three";

import type { HavokPlugin } from "./havokPlugin";
import type { Group } from "three";

class MeshAccumulator {
    private _vertices: Array<Vector3>;
    private _indices: Array<number>;
    private readonly _isRightHanded = true;
    private _collectIndices: boolean;
    /**
     * Constructor of the mesh accumulator
     * @param mesh - The mesh used to compute the world matrix.
     * @param collectIndices - use mesh indices
     * @param scene - The scene used to determine the right handed system.
     *
     * Merge mesh and its children so whole hierarchy can be used as a mesh shape or convex hull
     */
    constructor(collectIndices: boolean) {
        this._vertices = []; /// Vertices in body space
        this._indices = [];
        this._collectIndices = collectIndices;
    }
    /**
     * Adds a mesh to the physics engine.
     * @param mesh The mesh to add.
     * @param includeChildren Whether to include the children of the mesh.
     *
     * This method adds a mesh to the physics engine by computing the world matrix,
     * multiplying it with the body from world matrix, and then transforming the
     * coordinates of the mesh's vertices. It also adds the indices of the mesh
     * to the physics engine. If includeChildren is true, it will also add the
     * children of the mesh to the physics engine, ignoring any children which
     * have a physics impostor. This is useful for creating a physics engine
     * that accurately reflects the mesh and its children.
     */
    addNodeMeshes(mesh: Mesh | InstancedMesh, includeChildren: boolean) {
        // Force absoluteScaling to be computed; we're going to use that to bake
        // the scale of any parent nodes into this shape, as physics engines
        // usually use rigid transforms, so can't handle arbitrary scale.
        mesh.updateMatrixWorld(true);
        const meshScale = new Vector3();
        mesh.getWorldScale(meshScale);
        const rootScaled = new Matrix4().scale(meshScale);

        if (mesh.geometry) {
            this._addMesh(mesh as Mesh, rootScaled);
        }
        if (includeChildren) {
            mesh.updateMatrixWorld(true)
            const worldToRoot = mesh.matrixWorld.invert();
            const worldToRootScaled = worldToRoot.multiply(rootScaled);
            //  Ignore any children which have a physics body.
            const transformNodes = mesh.children.filter((m) => !m.userData.physicsBody);
            for (const m of transformNodes) {
                m.updateMatrixWorld(true);
                const childToWorld = m.matrixWorld;
                const childToRootScaled = childToWorld.multiply(worldToRootScaled);
                if (m.type === "Mesh") {
                    this._addMesh(m as Mesh, childToRootScaled);
                    // } else if (m instanceof InstancedMesh) {
                    //     this._addMesh(m.sourceMesh, childToRootScaled);
                }
            }
        }
    }
    _addMesh(mesh: Mesh, meshToRootMatrix: Matrix4) {
        const vertexData = mesh.geometry.attributes.position.array;
        const numVerts = vertexData.length / 3;
        const indexOffset = this._vertices.length;
        for (let v = 0; v < numVerts; v++) {
            const pos = new Vector3(vertexData[v * 3 + 0], vertexData[v * 3 + 1], vertexData[v * 3 + 2]);
            this._vertices.push(pos.applyMatrix4(meshToRootMatrix));
        }
        if (this._collectIndices) {
            const meshIndices = mesh.geometry.index!.array;
            if (meshIndices) {
                for (let i = 0; i < meshIndices.length; i += 3) {
                    // Havok wants the correct triangle winding to enable the interior triangle optimization
                    if (this._isRightHanded) {
                        this._indices.push(
                            meshIndices[i + 0] + indexOffset,
                            meshIndices[i + 1] + indexOffset,
                            meshIndices[i + 2] + indexOffset
                        );
                    }
                    else {
                        this._indices.push(
                            meshIndices[i + 2] + indexOffset,
                            meshIndices[i + 1] + indexOffset,
                            meshIndices[i + 0] + indexOffset
                        );
                    }
                }
            }
        }
    }
    /**
     * Allocate and populate the vertex positions inside the physics plugin.
     *
     * @param engine - The engine to allocate the memory in.
     * @returns An array of floats, whose backing memory is inside the engine. The array contains the
     * positions of the mesh vertices, where a position is defined by three floats. You must call
     * freeBuffer() on the returned array once you have finished with it, in order to free the
     * memory inside the engine..
     */
    getVertices(engine: HavokPhysicsWithBindings) {
        const nFloats = this._vertices.length * 3;
        const bytesPerFloat = 4;
        const nBytes = nFloats * bytesPerFloat;
        const bufferBegin = engine._malloc(nBytes);
        const ret = new Float32Array(engine.HEAPU8.buffer, bufferBegin, nFloats);
        for (let i = 0; i < this._vertices.length; i++) {
            ret[i * 3 + 0] = this._vertices[i].x;
            ret[i * 3 + 1] = this._vertices[i].y;
            ret[i * 3 + 2] = this._vertices[i].z;
        }
        return { offset: bufferBegin, numObjects: nFloats };
    }
    freeBuffer(engine: HavokPhysicsWithBindings, arr: {
        offset: number;
        numObjects: number;
    }) {
        engine._free(arr.offset);
    }
    /**
     * Allocate and populate the triangle indices inside the physics engine
     *
     * @param engine - The engine to allocate the memory in.
     * @returns A new Int32Array, whose backing memory is inside the engine. The array contains the indices
     * of the triangle positions, where a single triangle is defined by three indices. You must call
     * freeBuffer() on this array once you have finished with it, to free the memory inside the engine..
     */
    getTriangles(engine: HavokPhysicsWithBindings) {
        const bytesPerInt = 4;
        const nBytes = this._indices.length * bytesPerInt;
        const bufferBegin = engine._malloc(nBytes);
        const ret = new Int32Array(engine.HEAPU8.buffer, bufferBegin, this._indices.length);
        for (let i = 0; i < this._indices.length; i++) {
            ret[i] = this._indices[i];
        }
        return { offset: bufferBegin, numObjects: this._indices.length };
    }
}

export interface PhysicShapeOptions {
    /**
     * The type of the shape. This can be one of the following: SPHERE, BOX, CAPSULE, CYLINDER, CONVEX_HULL, MESH, HEIGHTFIELD, CONTAINER
     */
    type?: PhysicsShapeType;
    /**
     * The parameters of the shape. Varies depending of the shape type.
     */
    parameters?: PhysicsShapeParameters;
    /**
     * Reference to an already existing physics shape in the plugin.
     */
    pluginData?: any;
}

export interface PhysicsShapeParameters {
    /**
     * Shape center position
     */
    center?: Vector3;
    /**
     * Radius for cylinder, shape and capsule
     */
    radius?: number;
    /**
     * First point position that defines the cylinder or capsule
     */
    pointA?: Vector3;
    /**
     * Second point position that defines the cylinder or capsule
     */
    pointB?: Vector3;
    /**
     * Shape orientation
     */
    rotation?: Quaternion;
    /**
     * Dimesion extention for the box
     */
    extents?: Vector3;
    /**
     * Mesh used for Mesh shape or convex hull. It can be different than the mesh the body is attached to.
     */
    mesh?: Object3D | Group | Mesh;
    /**
     * Use children hierarchy
     */
    includeChildMeshes?: boolean;
    /**
     * The size of the heightfield in the X axis
     */
    heightFieldSizeX?: number;
    /**
     * The size of the heightfield in the Z axis
     */
    heightFieldSizeZ?: number;
    /**
     * The number of samples along the X axis
     */
    numHeightFieldSamplesX?: number;
    /**
     * The number of samples along the Z axis
     */
    numHeightFieldSamplesZ?: number;
    /**
     * The data for the heightfield
     */
    heightFieldData?: Float32Array;
}

/**
 * PhysicsShape class.
 * This class is useful for creating a physics shape that can be used in a physics engine.
 * A Physic Shape determine how collision are computed. It must be attached to a body.
 */
export class PhysicsShape {
    /**
     * V2 Physics plugin private data for single shape
     */
    _pluginData: any;
    /**
     * The V2 plugin used to create and manage this Physics Body
     */
    private _physicsPlugin: HavokPlugin;
    private _type;
    private _material!: PhysicsMaterial;
    private _isTrigger;
    private _isDisposed;

    /**
     * Constructs a new physics shape.
     * @param options The options for the physics shape. These are:
     *  * type: The type of the shape. This can be one of the following: SPHERE, BOX, CAPSULE, CYLINDER, CONVEX_HULL, MESH, HEIGHTFIELD, CONTAINER
     *  * parameters: The parameters of the shape.
     *  * pluginData: The plugin data of the shape. This is used if you already have a reference to the object on the plugin side.
     * You need to specify either type or pluginData.
     * @param scene The scene the shape belongs to.
     *
     * This code is useful for creating a new physics shape with the given type, options, and scene.
     * It also checks that the physics engine and plugin version are correct.
     * If not, it throws an error. This ensures that the shape is created with the correct parameters and is compatible with the physics engine.
     */
    constructor(options: PhysicShapeOptions, physicsPlugin: HavokPlugin) {
        /**
         * V2 Physics plugin private data for single shape
         */
        this._pluginData = undefined;
        this._isTrigger = false;
        this._isDisposed = false;
        this._physicsPlugin = physicsPlugin;
        if (options.pluginData !== undefined && options.pluginData !== null) {
            this._pluginData = options.pluginData;
            this._type = this._physicsPlugin.getShapeType(
                this
            );
        } else if (options.type !== undefined && options.type !== null) {
            this._type = options.type;
            const parameters = options.parameters ?? {};
            this.initShape(
                options.type,
                parameters as any
            );
        }
    }
    /**
     * Returns the string "PhysicsShape".
     * @returns "PhysicsShape"
     */
    getClassName() {
        return "PhysicsShape";
    }
    /**
     * Returns the type of the physics shape.
     * @returns The type of the physics shape.
     */
    get type() {
        return this._type;
    }
    /**
     * Set the membership mask of a shape. This is a bitfield of arbitrary
     * "categories" to which the shape is a member. This is used in combination
     * with the collide mask to determine if this shape should collide with
     * another.
     *
     * @param membershipMask Bitfield of categories of this shape.
     */
    set filterMembershipMask(membershipMask) {
        this._physicsPlugin.setShapeFilterMembershipMask(
            this,
            membershipMask
        );
    }
    /**
     * Get the membership mask of a shape.
     * @returns Bitmask of categories which this shape is a member of.
     */
    get filterMembershipMask() {
        return this._physicsPlugin.getShapeFilterMembershipMask(
            this
        );
    }
    /**
     * Sets the collide mask of a shape. This is a bitfield of arbitrary
     * "categories" to which this shape collides with. Given two shapes,
     * the engine will check if the collide mask and membership overlap:
     * shapeA.filterMembershipMask & shapeB.filterCollideMask
     *
     * If this value is zero (i.e. shapeB only collides with categories
     * which shapeA is _not_ a member of) then the shapes will not collide.
     *
     * Note, the engine will also perform the same test with shapeA and
     * shapeB swapped; the shapes will not collide if either shape has
     * a collideMask which prevents collision with the other shape.
     *
     * @param collideMask Bitmask of categories this shape should collide with
     */
    set filterCollideMask(collideMask) {
        this._physicsPlugin.setShapeFilterCollideMask(
            this,
            collideMask
        );
    }
    /**
     *
     * @returns Bitmask of categories that this shape should collide with
     */
    get filterCollideMask() {
        return this._physicsPlugin.getShapeFilterCollideMask(
            this
        );
    }
    /**
     *
     * @param material
     */
    set material(material) {
        this._physicsPlugin.setMaterial(
            this,
            material
        );
        this._material = material;
    }
    /**
     * Returns the material of the physics shape.
     * @returns The material of the physics shape.
     */
    get material() {
        if (!this._material) {
            this._material = this._physicsPlugin.getMaterial(
                this
            );
        }
        return this._material;
    }
    /**
     * Sets the density of the physics shape.
     * @param density The density of the physics shape.
     */
    set density(density) {
        this._physicsPlugin.setDensity(this, density);
    }
    /**
     * Returns the density of the physics shape.
     * @returns The density of the physics shape.
     */
    get density() {
        return this._physicsPlugin.getDensity(this);
    }
    set isTrigger(isTrigger) {
        if (this._isTrigger === isTrigger) {
            return;
        }
        this._isTrigger = isTrigger;
        this._physicsPlugin.setTrigger(
            this,
            isTrigger
        );
    }
    get isTrigger() {
        return this._isTrigger;
    }
    /**
     * Utility to add a child shape to this container,
     * automatically computing the relative transform between
     * the container shape and the child instance.
     *
     * @param parentTransform The transform node associated with this shape
     * @param newChild The new PhysicsShape to add
     * @param childTransform The transform node associated with the child shape
     */
    addChildFromParent(
        parentTransform: Object3D,
        newChild: PhysicsShape,
        childTransform: Object3D
    ) {
        const childToWorld = childTransform.matrixWorld;
        const parentToWorld = parentTransform.matrixWorld;
        const childToParent = childToWorld.multiply(parentToWorld.invert());
        const translation = new Vector3();
        const rotation = new Quaternion();
        const scale = new Vector3();
        childToParent.decompose(scale, rotation, translation);
        this.addChild(
            newChild,
            translation.toArray(),
            rotation.toArray(),
            scale.toArray()
        );
    }
    /**
     * Adds a child shape to a container with an optional transform
     * @param newChild The new PhysicsShape to add
     * @param translation Optional position of the child shape relative to this shape
     * @param rotation Optional rotation of the child shape relative to this shape
     * @param scale Optional scale of the child shape relative to this shape
     */
    addChild(
        newChild: PhysicsShape,
        translation: Vector3Havok = [0, 0, 0],
        rotation: QuaternionHavok = [0, 0, 0, 1],
        scale: Vector3Havok = [1, 1, 1]
    ) {
        const transformNative: QSTransform = [translation, rotation, scale];
        this._physicsPlugin._hknp.HP_Shape_AddChild(
            this._pluginData,
            newChild._pluginData,
            transformNative
        );
    }
    /**
     * Removes a child shape from this shape.
     * @param childIndex The index of the child shape to remove
     */
    removeChild(childIndex: number) {
        this._physicsPlugin.removeChild(
            this,
            childIndex
        );
    }
    /**
     * Returns the number of children of a physics shape.
     * @returns The number of children of a physics shape.
     */
    getNumChildren() {
        return this._physicsPlugin.getNumChildren(
            this
        );
    }
    /**
     * Returns the bounding box of the physics shape.
     * @returns The bounding box of the physics shape.
     */
    getBoundingBox() {
        return this._physicsPlugin.getBoundingBox(
            this
        );
    }
    initShape(type: PhysicsShapeType, options: PhysicsShapeParameters) {
        switch (type) {
            case 0 /* PhysicsShapeType.SPHERE */: {
                {
                    const radius = options.radius || 1;
                    const center: Vector3Havok = options.center ? options.center.toArray() : [0, 0, 0];
                    this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateSphere(center, radius)[1];
                }
                break;
            }
            case 3 /* PhysicsShapeType.BOX */: {
                {
                    const rotation: QuaternionHavok = options.rotation?.toArray() ?? [0, 0, 0, 1];
                    const extent: Vector3Havok = options.extents ? options.extents.toArray() : [1, 1, 1];
                    const center: Vector3Havok = options.center ? options.center.toArray() : [0, 0, 0];
                    this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateBox(center, rotation, extent)[1];
                }
                break;
            }
            case 1 /* PhysicsShapeType.CAPSULE */: {
                {
                    const pointA: Vector3Havok = options.pointA ? options.pointA.toArray() : [0, 0, 0];
                    const pointB: Vector3Havok = options.pointB ? options.pointB.toArray() : [0, 1, 0];
                    const radius = options.radius || 0;
                    this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateCapsule(pointA, pointB, radius)[1];
                }
                break;
            }
            case 5 /* PhysicsShapeType.CONTAINER */: {
                {
                    this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateContainer()[1];
                }
                break;
            }
            case 2 /* PhysicsShapeType.CYLINDER */: {
                {
                    const pointA: Vector3Havok = options.pointA ? options.pointA.toArray() : [0, 0, 0];
                    const pointB: Vector3Havok = options.pointB ? options.pointB.toArray() : [0, 1, 0];
                    const radius = options.radius || 0;
                    this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateCylinder(pointA, pointB, radius)[1];
                }
                break;
            }
            case 4 /* PhysicsShapeType.CONVEX_HULL */:
            case 6 /* PhysicsShapeType.MESH */: {
                {
                    const mesh = options.mesh;
                    if (mesh) {
                        const includeChildMeshes = !!options.includeChildMeshes;
                        const needIndices = type != 4 /* PhysicsShapeType.CONVEX_HULL */;
                        const accum = new MeshAccumulator(needIndices);
                        if ((mesh as Mesh).geometry) accum.addNodeMeshes(mesh as Mesh, includeChildMeshes);
                        const positions = accum.getVertices(this._physicsPlugin._hknp);
                        const numVec3s = positions.numObjects / 3;
                        if (type == 4 /* PhysicsShapeType.CONVEX_HULL */) {
                            this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateConvexHull(positions.offset, numVec3s)[1];
                        }
                        else {
                            const triangles = accum.getTriangles(this._physicsPlugin._hknp);
                            const numTriangles = triangles.numObjects / 3;
                            this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateMesh(positions.offset, numVec3s, triangles.offset, numTriangles)[1];
                            accum.freeBuffer(this._physicsPlugin._hknp, triangles);
                        }
                        accum.freeBuffer(this._physicsPlugin._hknp, positions);
                    }
                    else {
                        throw new Error("No mesh provided to create physics shape.");
                    }
                }
                break;
            }
            // case 7 /* PhysicsShapeType.HEIGHTFIELD */: {
            //     {
            //         if (options.groundMesh) {
            //             // update options with datas from groundMesh
            //             this._createOptionsFromGroundMesh(options);
            //         }
            //         if (options.numHeightFieldSamplesX && options.numHeightFieldSamplesZ && options.heightFieldSizeX && options.heightFieldSizeZ && options.heightFieldData) {
            //             const totalNumHeights = options.numHeightFieldSamplesX * options.numHeightFieldSamplesZ;
            //             const numBytes = totalNumHeights * 4;
            //             const bufferBegin = this._physicsPlugin._hknp._malloc(numBytes);
            //             const heightBuffer = new Float32Array(this._physicsPlugin._hknp.HEAPU8.buffer, bufferBegin, totalNumHeights);
            //             for (let x = 0; x < options.numHeightFieldSamplesX; x++) {
            //                 for (let z = 0; z < options.numHeightFieldSamplesZ; z++) {
            //                     const hkBufferIndex = z * options.numHeightFieldSamplesX + x;
            //                     const bjsBufferIndex = (options.numHeightFieldSamplesX - 1 - x) * options.numHeightFieldSamplesZ + z;
            //                     heightBuffer[hkBufferIndex] = options.heightFieldData[bjsBufferIndex];
            //                 }
            //             }
            //             const scaleX = options.heightFieldSizeX / (options.numHeightFieldSamplesX - 1);
            //             const scaleZ = options.heightFieldSizeZ / (options.numHeightFieldSamplesZ - 1);
            //             this._pluginData = this._physicsPlugin._hknp.HP_Shape_CreateHeightField(options.numHeightFieldSamplesX, options.numHeightFieldSamplesZ, [scaleX, 1, scaleZ], bufferBegin)[1];
            //             this._physicsPlugin._hknp._free(bufferBegin);
            //         }
            //         else {
            //             throw new Error("Missing required heightfield parameters");
            //         }
            //     }
            //     break;
            // }
            default: {
                throw new Error("Unsupported Shape Type.");
            }
        }
    }
    /**
     * Dispose the shape and release its associated resources.
     */
    dispose() {
        if (this._isDisposed) return;
        this._physicsPlugin.disposeShape(this);
        this._isDisposed = true;
    }
}
/**
 * Helper object to create a sphere shape
 */
export class PhysicsShapeSphere extends PhysicsShape {
    /**
     * Constructor for the Sphere Shape
     * @param center local center of the sphere
     * @param radius radius
     * @param havokPlugin Havok physics plugin
     */
    constructor(center: Vector3, radius: number, havokPlugin: HavokPlugin) {
        super(
            {
                type: 0 /* PhysicsShapeType.SPHERE */,
                parameters: { center: center, radius: radius },
            },
            havokPlugin
        );
    }
    /**
     * Derive an approximate sphere from the mesh.
     * @param mesh node from which to derive the sphere shape
     * @returns PhysicsShapeSphere
     */
    static GetBoundingCenterAndRadiusFromMesh(mesh: Mesh) {
        if (!mesh.geometry) {
            throw new Error("Object does not have geometry");
        }
        const geometry = mesh.geometry;
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        return {
            center: geometry.boundingSphere!.center,
            radius: geometry.boundingSphere!.radius,
        };
    }
}
/**
 * Helper object to create a capsule shape
 */
export class PhysicsShapeCapsule extends PhysicsShape {
    /**
     *
     * @param pointA Starting point that defines the capsule segment
     * @param pointB ending point of that same segment
     * @param radius radius
     * @param havokPlugin Havok physics plugin
     */
    constructor(pointA: Vector3, pointB: Vector3, radius: number, havokPlugin: HavokPlugin) {
        super(
            {
                type: 1 /* PhysicsShapeType.CAPSULE */,
                parameters: { pointA: pointA, pointB: pointB, radius: radius },
            },
            havokPlugin
        );
    }
    // /**
    //  * Derive an approximate capsule from the mesh. Note, this is
    //  * not the optimal bounding capsule.
    //  * @param mesh Node from which to derive a cylinder shape
    //  * @returns Physics Shape Capsule
    //  */
    // static FromMesh(mesh) {
    //     const boundsLocal = mesh.getBoundingInfo();
    //     const radius = boundsLocal.boundingBox.extendSize.x;
    //     const pointFromCenter = new Vector3(
    //         0,
    //         boundsLocal.boundingBox.extendSize.y - radius,
    //         0
    //     );
    //     const pointA = boundsLocal.boundingBox.center.add(pointFromCenter);
    //     const pointB = boundsLocal.boundingBox.center.subtract(pointFromCenter);
    //     return new PhysicsShapeCapsule(pointA, pointB, radius, mesh.getScene());
    // }
}
/**
 * Helper object to create a cylinder shape
 */
export class PhysicsShapeCylinder extends PhysicsShape {
    /**
     *
     * @param pointA Starting point that defines the cylinder segment
     * @param pointB ending point of that same segment
     * @param radius radius
     * @param havokPlugin Havok physics plugin
     */
    constructor(pointA: Vector3, pointB: Vector3, radius: number, havokPlugin: HavokPlugin) {
        super(
            {
                type: 2 /* PhysicsShapeType.CYLINDER */,
                parameters: { pointA: pointA, pointB: pointB, radius: radius },
            },
            havokPlugin
        );
    }
    // /**
    //  * Derive an approximate cylinder from the mesh. Note, this is
    //  * not the optimal bounding cylinder.
    //  * @param mesh Node from which to derive a cylinder shape
    //  * @returns Physics Shape Cylinder
    //  */
    // static FromMesh(mesh) {
    //     const boundsLocal = mesh.getBoundingInfo();
    //     const radius = boundsLocal.boundingBox.extendSize.x;
    //     const pointFromCenter = new Vector3(
    //         0,
    //         boundsLocal.boundingBox.extendSize.y,
    //         0
    //     );
    //     const pointA = boundsLocal.boundingBox.center.add(pointFromCenter);
    //     const pointB = boundsLocal.boundingBox.center.subtract(pointFromCenter);
    //     return new PhysicsShapeCylinder(pointA, pointB, radius, mesh.getScene());
    // }
}
/**
 * Helper object to create a box shape
 */
export class PhysicsShapeBox extends PhysicsShape {
    /**
     *
     * @param center local center of the box
     * @param rotation local orientation
     * @param extents size of the box in each direction
     * @param havokPlugin Havok physics plugin
     */
    constructor(center: Vector3, rotation: Quaternion, extents: Vector3, havokPlugin: HavokPlugin) {
        super(
            {
                type: 3 /* PhysicsShapeType.BOX */,
                parameters: { center: center, rotation: rotation, extents: extents },
            },
            havokPlugin
        );
    }
    // /**
    //  *
    //  * @param mesh
    //  * @returns PhysicsShapeBox
    //  */
    // static FromMesh(mesh) {
    //     const bounds = mesh.getBoundingInfo();
    //     const centerLocal = bounds.boundingBox.center;
    //     const extents = bounds.boundingBox.extendSize.scale(2.0); //<todo.eoin extendSize seems to really be half-extents?
    //     return new PhysicsShapeBox(
    //         centerLocal,
    //         Quaternion.Identity(),
    //         extents,
    //         mesh.getScene()
    //     );
    // }
}
/**
 * Helper object to create a convex hull shape
 */
export class PhysicsShapeConvexHull extends PhysicsShape {
    /**
     *
     * @param mesh the mesh to be used as topology infos for the convex hull
     * @param havokPlugin Havok physics plugin
     */
    constructor(mesh: Mesh, havokPlugin: HavokPlugin) {
        super(
            {
                type: 4 /* PhysicsShapeType.CONVEX_HULL */,
                parameters: { mesh: mesh },
            },
            havokPlugin
        );
    }
}
/**
 * Helper object to create a mesh shape
 */
export class PhysicsShapeMesh extends PhysicsShape {
    /**
     *
     * @param mesh the mesh topology that will be used to create the shape
     * @param havokPlugin Havok physics plugin
     */
    constructor(mesh: Mesh, havokPlugin: HavokPlugin) {
        super(
            { type: 6 /* PhysicsShapeType.MESH */, parameters: { mesh: mesh } },
            havokPlugin
        );
    }
}
/**
 * A shape container holds a variable number of shapes. Use AddChild to append to newly created parent container.
 */
export class PhysicsShapeContainer extends PhysicsShape {
    /**
     * Constructor of the Shape container
     * @param havokPlugin Havok physics plugin
     */
    constructor(havokPlugin: HavokPlugin) {
        super({ type: 5 /* PhysicsShapeType.CONTAINER */, parameters: {} }, havokPlugin);
    }
}
