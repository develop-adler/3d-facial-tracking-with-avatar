import { KeyboardEventTypes, type KeyboardInfo } from "@babylonjs/core/Events/keyboardEvents";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { UtilityLayerRenderer } from "@babylonjs/core/Rendering/utilityLayerRenderer";

import type SpaceBuilder from "@/3d/multiplayer/SpaceBuilder";
import type {
  GizmoTransformationType,
  ObjectAbsoluteTransforms,
} from "@/models/3d";
import type { StudioMeshMetaData, StudioObjectSubType, StudioObjectType } from "@/models/studio";
import { isMobile } from "@/utils/browserUtils";
import { areArraysEqual } from "@/utils/functionUtils";

import { clientSettings } from "clientSettings";
import { COLOR } from "constant";

import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

// because importing from '@babylonjs/core/Gizmos/gizmo' increases bundle size too much
enum GizmoAnchorPoint {
  /** The origin of the attached node */
  Origin = 0,
  /** The pivot point of the attached node*/
  Pivot = 1,
}

type AxisGizmoDragEvent = {
  delta: Vector3;
  dragPlanePoint: Vector3;
  dragPlaneNormal: Vector3;
  dragDistance: number;
  pointerId: number;
  pointerInfo: PointerInfo | null;
};

class GizmoHandler {
  readonly spaceBuilder: SpaceBuilder;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly gizmoManager: GizmoManager;
  readonly keyboardObservable: Observer<KeyboardInfo>;
  currentGizmoType: GizmoTransformationType;

  private _movedCamera: boolean = false;
  private _pannedCamera: boolean = false;
  private _dragCancelled: boolean = false;
  private _pointerUpEnabled: boolean = true;
  private _pointerUpCooldown?: globalThis.NodeJS.Timeout;
  private _gizmoDragSceneRenderObservable?: Observer<Scene>;
  private _pickPointerObservable?: Observer<PointerInfo>;

  readonly onSetGizmoTypeObservable: Observable<GizmoTransformationType>;

  private static readonly DRAG_SENSITIVITY_LOW = 0.1;
  private static readonly DRAG_SENSITIVITY_NORMAL = 1;
  private static readonly AXIS_X_COLOR = Color3.FromHexString(
    COLOR.brandPrimary
  );
  private static readonly AXIS_Y_COLOR = Color3.FromHexString(
    COLOR.studioYGizmo
  );
  private static readonly AXIS_Z_COLOR = Color3.FromHexString(
    COLOR.studioZGizmo
  );

  constructor(spaceBuilder: SpaceBuilder) {
    this.spaceBuilder = spaceBuilder;
    this.scene = spaceBuilder.scene;
    this.camera = spaceBuilder.camera;
    this._dragCancelled = false;
    this._movedCamera = false;
    this._pannedCamera = false;
    this.gizmoManager = this._createGizmoManager(spaceBuilder.utilityLayer);
    this.currentGizmoType = "location";
    this.onSetGizmoTypeObservable = new Observable<GizmoTransformationType>();
    this.setupPointerPickBehavior();
    this.keyboardObservable = this._initKeyboardHandler();
  }

  private _createGizmoManager(
    utilityLayer: UtilityLayerRenderer
  ): GizmoManager {
    const gizmoManager = new GizmoManager(
      utilityLayer.utilityLayerScene,
      isMobile() ? 8 : 1.4,
      utilityLayer
    );

    gizmoManager.utilityLayer.utilityLayerScene.autoClearDepthAndStencil = true;

    // set custom gizmo meshes
    gizmoManager.positionGizmoEnabled = true;
    gizmoManager.rotationGizmoEnabled = true;
    gizmoManager.scaleGizmoEnabled = true;
    this._setCustomGizmoMeshes(gizmoManager);
    setTimeout(() => {
      gizmoManager.positionGizmoEnabled = this.currentGizmoType === "location";
      gizmoManager.rotationGizmoEnabled = this.currentGizmoType === "rotation";
      gizmoManager.scaleGizmoEnabled = this.currentGizmoType === "scale";

      this.setGizmoType(this.currentGizmoType);
    }, 1000 / 60);
    gizmoManager.boundingBoxGizmoEnabled = false;

    // eslint-disable-next-line unicorn/no-null
    gizmoManager.attachableMeshes = null;

    // disable default pointer attach behavior
    gizmoManager.usePointerToAttachGizmos = false;

    gizmoManager.onAttachedToMeshObservable.add((mesh) => {
      if (!mesh) {
        this.spaceBuilder.objectSelectHandler.onSetSelectedObjectObservable.notifyObservers(
          // eslint-disable-next-line unicorn/no-null
          null
        );
        // this.renderScene();
        return;
      }

      if (mesh === this.spaceBuilder.objectSelectHandler.selectedMeshGroup) {
        this.setGizmoType(this.currentGizmoType);
        this.spaceBuilder.objectSelectHandler.onSetSelectedObjectObservable.notifyObservers(
          // eslint-disable-next-line unicorn/no-null
          null
        );
        return;
      }

      const meshMetadata = mesh.metadata as StudioMeshMetaData;

      // switch gizmo axis based on object type
      this._updateGizmoAxis(meshMetadata.type, meshMetadata.subType);

      // handle object lock/unlock state
      this.spaceBuilder.objectSelectHandler.handleObjectLockState(mesh);

      this.spaceBuilder.objectSelectHandler.onSetSelectedObjectObservable.notifyObservers(
        mesh
      );
      this.spaceBuilder.updateObjectTransformUI(mesh);

      // this.renderScene();
    });

    return gizmoManager;
  }

  private _setCustomGizmoMeshes(gizmoManager: GizmoManager) {
    const hoverMaterial = new StandardMaterial(
      "gizmoHoverMaterial",
      gizmoManager.utilityLayer.utilityLayerScene
    );
    hoverMaterial.disableLighting = true;
    hoverMaterial.emissiveColor = Color3.Yellow();
    hoverMaterial.freeze();

    if (gizmoManager.gizmos.positionGizmo) {
      const posGizmo = gizmoManager.gizmos.positionGizmo;

      posGizmo.xGizmo.coloredMaterial.emissiveColor = GizmoHandler.AXIS_X_COLOR;
      posGizmo.yGizmo.coloredMaterial.emissiveColor = GizmoHandler.AXIS_Y_COLOR;
      posGizmo.zGizmo.coloredMaterial.emissiveColor = GizmoHandler.AXIS_Z_COLOR;

      posGizmo.xGizmo.coloredMaterial.freeze();
      posGizmo.yGizmo.coloredMaterial.freeze();
      posGizmo.zGizmo.coloredMaterial.freeze();

      const yPlane = CreateBox(
        "yPlaneGizmo",
        {
          width: 0.025,
          height: 0.002,
          depth: 0.025,
        },
        gizmoManager.utilityLayer.utilityLayerScene
      );
      yPlane.convertToUnIndexedMesh();
      yPlane.alwaysSelectAsActiveMesh = true;
      yPlane.position = new Vector3(0.02, 0, 0.02);
      yPlane.material = posGizmo.yGizmo.coloredMaterial;
      posGizmo.yPlaneGizmo.setCustomMesh(yPlane);

      const xPlane = CreateBox(
        "xPlaneGizmo",
        {
          width: 0.002,
          height: 0.025,
          depth: 0.025,
        },
        gizmoManager.utilityLayer.utilityLayerScene
      );
      xPlane.convertToUnIndexedMesh();
      xPlane.alwaysSelectAsActiveMesh = true;
      xPlane.position = new Vector3(0, 0.02, 0.02);
      xPlane.material = posGizmo.xGizmo.coloredMaterial;
      posGizmo.xPlaneGizmo.setCustomMesh(xPlane);

      const zPlane = CreateBox(
        "zPlaneGizmo",
        {
          width: 0.025,
          height: 0.025,
          depth: 0.002,
        },
        gizmoManager.utilityLayer.utilityLayerScene
      );
      zPlane.convertToUnIndexedMesh();
      zPlane.alwaysSelectAsActiveMesh = true;
      zPlane.position = new Vector3(0.02, 0.02, 0);
      zPlane.material = posGizmo.zGizmo.coloredMaterial;
      posGizmo.zPlaneGizmo.setCustomMesh(zPlane);

      // Update material based on if it's being hovered on
      gizmoManager.utilityLayer.utilityLayerScene.onPointerObservable.add(
        (pointerInfo) => {
          if (!pointerInfo.pickInfo) return;

          switch (pointerInfo.pickInfo.pickedMesh) {
            case yPlane: {
              yPlane.material = hoverMaterial;
              break;
            }
            case xPlane: {
              xPlane.material = hoverMaterial;
              break;
            }
            case zPlane: {
              zPlane.material = hoverMaterial;
              break;
            }
            default: {
              yPlane.material = posGizmo.yGizmo.coloredMaterial;
              xPlane.material = posGizmo.xGizmo.coloredMaterial;
              zPlane.material = posGizmo.zGizmo.coloredMaterial;
              break;
            }
          }
        }
      );
    }

    if (gizmoManager.gizmos.rotationGizmo) {
      const rotationGizmo = gizmoManager.gizmos.rotationGizmo;

      rotationGizmo.xGizmo.coloredMaterial.emissiveColor =
        GizmoHandler.AXIS_X_COLOR;
      rotationGizmo.yGizmo.coloredMaterial.emissiveColor =
        GizmoHandler.AXIS_Y_COLOR;
      rotationGizmo.zGizmo.coloredMaterial.emissiveColor =
        GizmoHandler.AXIS_Z_COLOR;

      rotationGizmo.xGizmo.coloredMaterial.freeze();
      rotationGizmo.yGizmo.coloredMaterial.freeze();
      rotationGizmo.zGizmo.coloredMaterial.freeze();
    }

    if (gizmoManager.gizmos.scaleGizmo) {
      const scaleGizmo = gizmoManager.gizmos.scaleGizmo;

      scaleGizmo.xGizmo.coloredMaterial.emissiveColor =
        GizmoHandler.AXIS_X_COLOR;
      scaleGizmo.yGizmo.coloredMaterial.emissiveColor =
        GizmoHandler.AXIS_Y_COLOR;
      scaleGizmo.zGizmo.coloredMaterial.emissiveColor =
        GizmoHandler.AXIS_Z_COLOR;

      scaleGizmo.xGizmo.coloredMaterial.freeze();
      scaleGizmo.yGizmo.coloredMaterial.freeze();
      scaleGizmo.zGizmo.coloredMaterial.freeze();

      const boxSize = 0.026;
      const boxGizmo = CreateBox(
        "boxGizmo",
        {
          width: boxSize,
          height: boxSize,
          depth: boxSize,
        },
        gizmoManager.utilityLayer.utilityLayerScene
      );
      boxGizmo.convertToUnIndexedMesh();
      boxGizmo.alwaysSelectAsActiveMesh = true;
      boxGizmo.position = new Vector3(
        boxSize * 0.52,
        boxSize * 0.52,
        boxSize * 0.52
      );

      const boxGizmoMat = new StandardMaterial(
        "boxGizmoMat",
        gizmoManager.utilityLayer.utilityLayerScene
      );
      boxGizmoMat.disableLighting = true;
      boxGizmoMat.emissiveColor = new Color3(0.9, 0.8, 0);
      boxGizmoMat.freeze();
      boxGizmo.material = boxGizmoMat;

      scaleGizmo.uniformScaleGizmo.setCustomMesh(boxGizmo);
      gizmoManager.utilityLayer.utilityLayerScene.onPointerObservable.add(
        (pointerInfo) => {
          if (!pointerInfo.pickInfo) return;

          boxGizmo.material =
            pointerInfo.pickInfo.pickedMesh === boxGizmo
              ? hoverMaterial
              : boxGizmoMat;
        }
      );
    }
  }

  /** Detach gizmo when clicked on empty space and attach when clicked on mesh */
  private setupPointerPickBehavior() {
    this.camera.onViewMatrixChangedObservable.add(() => {
      this._movedCamera = true;
      this._pannedCamera = true;
    });

    if (this._pickPointerObservable) this._pickPointerObservable.remove();

    this._pickPointerObservable = this.scene.onPointerObservable.add(
      (pointerInfo: PointerInfo) => {
        // if (this.isIdle) this.isIdle = false;
        // if (pointerInfo.event.type === 'mouseup' || pointerInfo.event.type === 'pointerup') {
        //   this._startIdleTimeout();
        // }

        if (
          this.spaceBuilder.isPreviewMode ||
          this.spaceBuilder.isThumbnailCaptureMode
        )
          return;

        // prevent object selection in edit user spawn area mode
        if (
          this.spaceBuilder.isEditSpawnAreaMode &&
          this.gizmoManager.attachedMesh !== null
        ) {
          return;
        }

        // if (pointerInfo.event.type === 'pointerdown' || pointerInfo.event.type === 'mousedown') {
        //   POINTER_INFO.isPointerDown = true;
        // }

        // // render the scene on pointer move
        // if (pointerInfo.event.type === 'mousemove' || pointerInfo.event.type === 'pointermove') {
        //   this.forceRenderScene = true;

        //   POINTER_INFO.isPointerMoving = true;
        //   if (POINTER_INFO.checkPointerMoveTimeout) {
        //     clearTimeout(POINTER_INFO.checkPointerMoveTimeout);
        //   }
        //   POINTER_INFO.checkPointerMoveTimeout = setTimeout(() => {
        //     POINTER_INFO.isPointerMoving = false;
        //     this.forceRenderScene = false;
        //   }, 64);
        // }

        // register left click
        if (pointerInfo.event.button !== 0) return;

        switch (pointerInfo.event.type) {
          case "mousedown":
          case "pointerdown": {
            this._movedCamera = false;
            break;
          }
          case "mouseup":
          case "pointerup": {
            if (this._movedCamera) break;

            // prevent duplicate multiple pointer up event from being fired with timeout
            if (!this._pointerUpEnabled) break;

            this._pointerUpEnabled = false;
            if (this._pointerUpCooldown) clearTimeout(this._pointerUpCooldown);
            this._pointerUpCooldown = setTimeout(() => {
              this._pointerUpEnabled = true;
            }, (1000 / 60) * 2);

            // render scene for 5 frames to fix gpuPicker.pickAsync() sometimes not working
            const interval = setInterval(() => {
              // this.renderScene();
            }, 1000 / 60); // 1000 / 60
            setTimeout(() => {
              clearInterval(interval);
            }, (1000 / 60) * 5);

            const handleSelectObject = (mesh?: AbstractMesh | null) => {
              if (!mesh) {
                this.spaceBuilder.objectSelectHandler.unselectAllObjects(true);
                // this.renderScene();
                return;
              }

              const selectSingleObject = (meshToAttach: AbstractMesh) => {
                for (const child of this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()) {
                  // eslint-disable-next-line unicorn/no-null
                  (child as AbstractMesh).setParent(null);
                  this.spaceBuilder.objectHighlightHandler.hideObjectOutline(
                    child as AbstractMesh
                  );
                }

                // single mesh select
                // don't re-select same mesh
                if (meshToAttach === this.gizmoManager.attachedMesh) return;

                this.spaceBuilder.objectHighlightHandler.hideObjectOutline(
                  this.gizmoManager.attachedMesh
                );
                this.gizmoManager.attachToMesh(meshToAttach);

                this.spaceBuilder.saveStateHandler.saveState("select", {
                  mesh: meshToAttach,
                });
              };

              // get the top level parent mesh of mesh
              let newMeshToAttach = mesh;
              if (newMeshToAttach.parent) {
                while (newMeshToAttach.parent) {
                  // if is group node, ignore
                  if (
                    newMeshToAttach.parent ===
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                  ) {
                    break;
                  }
                  newMeshToAttach = newMeshToAttach.parent as AbstractMesh;
                }
              }

              // multiple mesh select
              if (
                this.spaceBuilder.keyboardHandler.keyDown.control &&
                this.gizmoManager.attachedMesh
              ) {
                // if clicked mesh is children of group node, remove from group node instead
                if (
                  this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                    .getChildren()
                    .includes(newMeshToAttach)
                ) {
                  // eslint-disable-next-line unicorn/no-null
                  newMeshToAttach.setParent(null);
                  this.spaceBuilder.objectHighlightHandler.hideObjectOutline(
                    newMeshToAttach
                  );

                  // if group node only has 1 child, attach to mesh directly instead
                  if (
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()
                      .length === 1
                  ) {
                    const child =
                      this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()[0] as AbstractMesh;
                    // eslint-disable-next-line unicorn/no-null
                    child.setParent(null);
                    selectSingleObject(child);
                    return;
                  }

                  this.spaceBuilder.saveStateHandler.saveState("select", {
                    meshes:
                      this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren(),
                  });

                  // position group node at the center of all children
                  const center = Vector3.Zero();
                  const childMeshes =
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildMeshes();
                  const directChildren =
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren();

                  for (const child of childMeshes) {
                    center.addInPlace(child.getAbsolutePosition());
                  }
                  center.scaleInPlace(1 / childMeshes.length);

                  // remove children from group node, set group node position, then re-add children again
                  for (const child of directChildren) {
                    // eslint-disable-next-line unicorn/no-null
                    (child as AbstractMesh).setParent(null);
                  }
                  this.spaceBuilder.objectSelectHandler.selectedMeshGroup.setAbsolutePosition(
                    center
                  );
                  for (const child of directChildren)
                    (child as AbstractMesh).setParent(
                      this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                    );
                } else if (
                  this.gizmoManager.attachedMesh ===
                  this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                ) {
                  // if selected mesh is group already, add new mesh to group

                  // position group node at the center of all children
                  const center = Vector3.Zero();
                  const childMeshes =
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildMeshes();
                  childMeshes.push(newMeshToAttach);
                  for (const child of childMeshes) {
                    center.addInPlace(child.getAbsolutePosition());
                  }
                  center.scaleInPlace(1 / childMeshes.length);

                  // remove children from group node, set group node position,
                  // then re-add children, including the new mesh
                  const directChildren =
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren();
                  for (const child of directChildren) {
                    // eslint-disable-next-line unicorn/no-null
                    (child as AbstractMesh).setParent(null);
                  }
                  this.spaceBuilder.objectSelectHandler.selectedMeshGroup.setAbsolutePosition(
                    center
                  );
                  directChildren.push(newMeshToAttach);
                  for (const child of directChildren)
                    (child as AbstractMesh).setParent(
                      this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                    );

                  this.spaceBuilder.saveStateHandler.saveState("select", {
                    meshes:
                      this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren(),
                  });
                } else {
                  // if selected mesh is single mesh, add to group node and attach gizmo to group node
                  if (newMeshToAttach === this.gizmoManager.attachedMesh)
                    return;

                  // position group node at the center of all children
                  const center = Vector3.Zero();
                  for (const mesh of [
                    this.gizmoManager.attachedMesh,
                    newMeshToAttach,
                  ]) {
                    center.addInPlace(mesh.getAbsolutePosition());
                  }

                  center.scaleInPlace(0.5); // average position
                  this.spaceBuilder.objectSelectHandler.selectedMeshGroup.setAbsolutePosition(
                    center
                  );

                  this.gizmoManager.attachedMesh.setParent(
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                  );
                  newMeshToAttach.setParent(
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                  );

                  this.gizmoManager.attachToMesh(
                    this.spaceBuilder.objectSelectHandler
                      .selectedMeshGroup as AbstractMesh
                  );

                  this.spaceBuilder.saveStateHandler.saveState("select", {
                    meshes:
                      this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren(),
                  });
                }

                // show outline for all objects in group
                this.spaceBuilder.objectHighlightHandler.showObjectOutlineForGroup(
                  this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren()
                );

                if (clientSettings.DEBUG) {
                  console.log(
                    "Selected group:",
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup,
                    this.spaceBuilder.objectSelectHandler.selectedMeshGroup
                      .getChildren()
                      .map((child) => child.metadata.name)
                  );
                }

                return;
              }

              selectSingleObject(newMeshToAttach);

              // this.renderScene();
            };

            if (this.spaceBuilder.objectSelectHandler.gpuPicker) {
              // this.renderScene();
              this.spaceBuilder.objectSelectHandler.gpuPicker
                .pickAsync(this.scene.pointerX, this.scene.pointerY)
                .then((pickingInfo) => {
                  handleSelectObject(pickingInfo?.mesh);
                });
            } else {
              const pickInfo = this.scene.pick(
                this.scene.pointerX,
                this.scene.pointerY
              );
              handleSelectObject(pickInfo.pickedMesh);
            }
            break;
          }
        }
      }
    );
  }

  setGizmoType(type?: GizmoTransformationType): void {
    if (type) this.currentGizmoType = type;

    const gizmoType = type ?? this.currentGizmoType;

    if (
      this.gizmoManager.attachedMesh &&
      this.spaceBuilder.lockedObjects.includes(
        this.gizmoManager.attachedMesh.uniqueId
      )
    ) {
      this.gizmoManager.positionGizmoEnabled = false;
      this.gizmoManager.rotationGizmoEnabled = false;
      this.gizmoManager.scaleGizmoEnabled = false;
      return;
    }

    const areAllLocked = this.spaceBuilder.objectSelectHandler.selectedMeshGroup
      .getChildren()
      .every((mesh) => this.spaceBuilder.lockedObjects.includes(mesh.uniqueId));
    if (
      this.gizmoManager.attachedMesh ===
      this.spaceBuilder.objectSelectHandler.selectedMeshGroup &&
      areAllLocked
    ) {
      this.gizmoManager.positionGizmoEnabled = false;
      this.gizmoManager.rotationGizmoEnabled = false;
      this.gizmoManager.scaleGizmoEnabled = false;
      return;
    }

    this.gizmoManager.positionGizmoEnabled = gizmoType === "location";
    this.gizmoManager.rotationGizmoEnabled = gizmoType === "rotation";
    this.gizmoManager.scaleGizmoEnabled = gizmoType === "scale";

    if (
      this.gizmoManager.attachedMesh?.metadata &&
      Object.hasOwn(this.gizmoManager.attachedMesh?.metadata, "type") &&
      this.gizmoManager.attachedMesh?.metadata.type === "images"
    ) {
      this.gizmoManager.scaleGizmoEnabled = false;
      this.gizmoManager.boundingBoxGizmoEnabled = gizmoType === "scale";
    } else {
      this.gizmoManager.boundingBoxGizmoEnabled = false;
    }

    // disable bounding box gizmo object relocation
    this.gizmoManager.boundingBoxDragBehavior.detach();
    // disable bounding box gizmo rotation
    if (this.gizmoManager.gizmos.boundingBoxGizmo) {
      this.gizmoManager.gizmos.boundingBoxGizmo.setEnabledRotationAxis("");
      this.gizmoManager.gizmos.boundingBoxGizmo.rotationSphereSize = 0;
    }

    if (this.gizmoManager.gizmos.positionGizmo) {
      // set anchor point to mesh pivot
      this.gizmoManager.gizmos.positionGizmo.anchorPoint =
        GizmoAnchorPoint.Pivot;

      this.gizmoManager.gizmos.positionGizmo.planarGizmoEnabled = true;

      // use world space orientation, more beginner friendly,
      // can add option to switch to local space later
      this.gizmoManager.gizmos.positionGizmo.updateGizmoRotationToMatchAttachedMesh =
        false;
    }

    if (this.gizmoManager.gizmos.rotationGizmo) {
      // set anchor point to mesh pivot
      this.gizmoManager.gizmos.rotationGizmo.anchorPoint =
        GizmoAnchorPoint.Pivot;

      if (
        this.gizmoManager.attachedMesh ===
        this.spaceBuilder.objectSelectHandler.selectedMeshGroup
      )
        return;

      this.gizmoManager.gizmos.rotationGizmo.updateGizmoRotationToMatchAttachedMesh =
        this.gizmoManager.attachedMesh?.metadata.type === "images"
          ? false
          : true;
    }

    if (this.gizmoManager.gizmos.scaleGizmo) {
      // set anchor point to mesh pivot
      this.gizmoManager.gizmos.scaleGizmo.anchorPoint = GizmoAnchorPoint.Pivot;
    }

    if (this.gizmoManager.gizmos.positionGizmo) {
      const positionGizmo = this.gizmoManager.gizmos.positionGizmo;

      positionGizmo.onDragStartObservable.clear();
      positionGizmo.xGizmo.dragBehavior.onDragObservable.clear();
      positionGizmo.yGizmo.dragBehavior.onDragObservable.clear();
      positionGizmo.zGizmo.dragBehavior.onDragObservable.clear();
      positionGizmo.xPlaneGizmo.dragBehavior.onDragObservable.clear();
      positionGizmo.yPlaneGizmo.dragBehavior.onDragObservable.clear();
      positionGizmo.zPlaneGizmo.dragBehavior.onDragObservable.clear();
      positionGizmo.onDragEndObservable.clear();

      positionGizmo.onDragStartObservable.add(() =>
        this.storeOldMeshTransforms()
      );
      positionGizmo.onDragEndObservable.add(() => {
        if (!this.gizmoManager.attachedMesh) return;

        if (this._dragCancelled) {
          this._dragCancelled = false;
        } else if (
          this.spaceBuilder.objectSelectHandler.storedMeshTransforms ||
          Object.keys(
            this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms
          ).length > 0
        ) {
          this.saveTransformState("move");
        }
      });

      const observer = (event: AxisGizmoDragEvent) => {
        if (!this.gizmoManager.attachedMesh) return;

        const delta = event.delta.clone();
        if (this.spaceBuilder.keyboardHandler.keyDown.shift) {
          delta.scaleInPlace(GizmoHandler.DRAG_SENSITIVITY_LOW);
        }
        this.gizmoManager.attachedMesh.position.addInPlace(delta.clone());

        this.spaceBuilder.updateObjectTransformUI(
          this.gizmoManager.attachedMesh
        );
      };

      positionGizmo.xGizmo.dragBehavior.onDragObservable.add(observer);
      positionGizmo.yGizmo.dragBehavior.onDragObservable.add(observer);
      positionGizmo.zGizmo.dragBehavior.onDragObservable.add(observer);
      positionGizmo.xPlaneGizmo.dragBehavior.onDragObservable.add(observer);
      positionGizmo.yPlaneGizmo.dragBehavior.onDragObservable.add(observer);
      positionGizmo.zPlaneGizmo.dragBehavior.onDragObservable.add(observer);
    }

    if (this.gizmoManager.gizmos.rotationGizmo) {
      const rotationGizmo = this.gizmoManager.gizmos.rotationGizmo;

      rotationGizmo.onDragStartObservable.clear();
      rotationGizmo.onDragObservable.clear();
      rotationGizmo.onDragEndObservable.clear();

      rotationGizmo.onDragStartObservable.add(() =>
        this.storeOldMeshTransforms()
      );
      rotationGizmo.onDragEndObservable.add(() => {
        if (!this.gizmoManager.attachedMesh) return;

        if (this._dragCancelled) {
          this._dragCancelled = false;
        } else if (
          this.spaceBuilder.objectSelectHandler.storedMeshTransforms ||
          Object.keys(
            this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms
          ).length > 0
        ) {
          this.saveTransformState("rotate");
        }
      });
      rotationGizmo.onDragObservable.add(() => {
        if (this.spaceBuilder.keyboardHandler.keyDown.shift) {
          rotationGizmo.snapDistance = Math.PI / 180;
          rotationGizmo.sensitivity = GizmoHandler.DRAG_SENSITIVITY_LOW;
        } else if (
          this.spaceBuilder.keyboardHandler.keyDown.control ||
          this.spaceBuilder.keyboardHandler.keyDown.meta
        ) {
          // increment rotation every 5 degrees
          rotationGizmo.snapDistance = Math.PI / 36;
        } else {
          rotationGizmo.snapDistance = Math.PI / 180;
          rotationGizmo.sensitivity = GizmoHandler.DRAG_SENSITIVITY_NORMAL;
        }

        if (this.gizmoManager.attachedMesh) {
          this.spaceBuilder.updateObjectTransformUI(
            this.gizmoManager.attachedMesh
          );
        }
      });
    }

    if (this.gizmoManager.gizmos.scaleGizmo) {
      const scaleGizmo = this.gizmoManager.gizmos.scaleGizmo;

      scaleGizmo.onDragStartObservable.clear();
      scaleGizmo.onDragObservable.clear();
      scaleGizmo.onDragEndObservable.clear();

      scaleGizmo.onDragStartObservable.add(() => this.storeOldMeshTransforms());
      scaleGizmo.onDragEndObservable.add(() => {
        if (!this.gizmoManager.attachedMesh) return;

        if (this._dragCancelled) {
          this._dragCancelled = false;
        } else if (
          this.spaceBuilder.objectSelectHandler.storedMeshTransforms ||
          Object.keys(
            this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms
          ).length > 0
        ) {
          this.saveTransformState("scale");
        }
      });

      // switch gizmo axis based on object type
      if (this.gizmoManager.attachedMesh) {
        this.spaceBuilder.updateObjectTransformUI(
          this.gizmoManager.attachedMesh
        );

        const meshMetadata = this.gizmoManager.attachedMesh
          .metadata as StudioMeshMetaData;

        // switch gizmo axis based on object type
        this._updateGizmoAxis(meshMetadata.type, meshMetadata.subType);
      }
      scaleGizmo.onDragObservable.add(() => {
        // // add min and max size limit
        // const maxSize = 5;
        // const minSize = 0.1;
        // if (this.gizmoManager.attachedMesh) {
        //   const mesh = this.gizmoManager.attachedMesh;
        //   switch (true) {
        //     case mesh.scaling.x > maxSize:
        //     case mesh.scaling.y > maxSize:
        //     case mesh.scaling.z > maxSize:
        //       mesh.scaling.x = maxSize;
        //       mesh.scaling.y = maxSize;
        //       mesh.scaling.z = maxSize;
        //       break;
        //     case mesh.scaling.x < minSize:
        //     case mesh.scaling.y < minSize:
        //     case mesh.scaling.z < minSize:
        //       mesh.scaling.x = minSize;
        //       mesh.scaling.y = minSize;
        //       mesh.scaling.z = minSize;
        //       break;
        //   }

        //   this.spaceBuilder.updateObjectTransformUI(mesh);
        // }

        scaleGizmo.sensitivity = this.spaceBuilder.keyboardHandler.keyDown.shift
          ? GizmoHandler.DRAG_SENSITIVITY_LOW
          : GizmoHandler.DRAG_SENSITIVITY_NORMAL;

        if (this.gizmoManager.attachedMesh) {
          this.spaceBuilder.updateObjectTransformUI(
            this.gizmoManager.attachedMesh
          );
        }
      });
    }

    if (this.gizmoManager.gizmos.boundingBoxGizmo) {
      const bbGizmo = this.gizmoManager.gizmos.boundingBoxGizmo;

      bbGizmo.onDragStartObservable.clear();
      bbGizmo.onScaleBoxDragObservable.clear();
      bbGizmo.onScaleBoxDragEndObservable.clear();

      bbGizmo.onDragStartObservable.add(() => this.storeOldMeshTransforms());
      bbGizmo.onScaleBoxDragEndObservable.add(() => {
        if (!this.gizmoManager.attachedMesh) return;

        if (this._dragCancelled) {
          this._dragCancelled = false;
        } else if (
          this.spaceBuilder.objectSelectHandler.storedMeshTransforms ||
          Object.keys(
            this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms
          ).length > 0
        ) {
          this.saveTransformState("scale");
        }
      });
      bbGizmo.onScaleBoxDragObservable.add(() => {
        if (this.gizmoManager.attachedMesh) {
          this.spaceBuilder.updateObjectTransformUI(
            this.gizmoManager.attachedMesh
          );
        }
      });
    }
  }

  private _updateGizmoAxis(
    _type: StudioObjectType,
    _subType: StudioObjectSubType
  ) {
    this._gizmoDragSceneRenderObservable?.remove();
    this._gizmoDragSceneRenderObservable = undefined;

    // // use bounding box gizmo for images type
    // if (this.gizmoManager.scaleGizmoEnabled === true) {
    //   if (type === "images") {
    //     this.gizmoManager.scaleGizmoEnabled = false;
    //     this.gizmoManager.boundingBoxGizmoEnabled = true;

    //     // disable bounding box gizmo object relocation
    //     this.gizmoManager.boundingBoxDragBehavior.detach();
    //     // disable bounding box gizmo rotation
    //     if (this.gizmoManager.gizmos.boundingBoxGizmo) {
    //       this.gizmoManager.gizmos.boundingBoxGizmo.setEnabledRotationAxis("");
    //       this.gizmoManager.gizmos.boundingBoxGizmo.rotationSphereSize = 0;
    //     }
    //   }
    // } else if (
    //   this.gizmoManager.boundingBoxGizmoEnabled === true &&
    //   type !== "images"
    // ) {
      this.gizmoManager.scaleGizmoEnabled = true;
      this.gizmoManager.boundingBoxGizmoEnabled = false;
    // }

    if (this.gizmoManager.gizmos.positionGizmo) {
      const posGizmo = this.gizmoManager.gizmos.positionGizmo;
      posGizmo.xGizmo.isEnabled = true;
      posGizmo.yGizmo.isEnabled = true;
      posGizmo.zGizmo.isEnabled = true;

      posGizmo.xPlaneGizmo.isEnabled = true;
      posGizmo.yPlaneGizmo.isEnabled = true;
      posGizmo.zPlaneGizmo.isEnabled = true;
    }

    if (this.gizmoManager.gizmos.rotationGizmo) {
      if (this.gizmoManager.attachedMesh?.metadata.isUserSpawnPlane === true) {
        this.gizmoManager.gizmos.rotationGizmo.xGizmo.isEnabled = false;
        this.gizmoManager.gizmos.rotationGizmo.yGizmo.isEnabled = true;
        this.gizmoManager.gizmos.rotationGizmo.zGizmo.isEnabled = false;
      } else {
        this.gizmoManager.gizmos.rotationGizmo.xGizmo.isEnabled = true;
        this.gizmoManager.gizmos.rotationGizmo.yGizmo.isEnabled = true;
        this.gizmoManager.gizmos.rotationGizmo.zGizmo.isEnabled = true;
      }

      this.gizmoManager.gizmos.rotationGizmo.updateGizmoRotationToMatchAttachedMesh =
        false;
    }

    if (this.gizmoManager.gizmos.scaleGizmo) {
      this.gizmoManager.gizmos.scaleGizmo.xGizmo.isEnabled = true;
      this.gizmoManager.gizmos.scaleGizmo.yGizmo.isEnabled = true;
      this.gizmoManager.gizmos.scaleGizmo.zGizmo.isEnabled =
        this.gizmoManager.attachedMesh?.metadata.type === "images"
          ? false
          : true;
      if (this.gizmoManager.attachedMesh?.metadata.isUserSpawnPlane === true) {
        this.gizmoManager.gizmos.scaleGizmo.yGizmo.isEnabled = false;
      }
    }

    // TODO: VERY BUGGY IMPLEMENTATION, IMPROVE THIS IN THE FUTURE
    // // snap backside of wall objects to wall
    // this._gizmoDragSceneRenderObservable = this.scene.onBeforeRenderObservable.add(() => {
    //   if (!this.gizmoManager.attachedMesh) return;

    //   const mesh = this.gizmoManager.attachedMesh;

    //   if (this.gizmoManager.gizmos.positionGizmo?.isDragging !== true) return;

    //   // snap back side of picture frames to walls
    //   if (subType === 'picture_frame') {
    //     // if ray hits wall mesh, snap mesh to wall mesh
    //     const wallMeshes = this.scene.meshes.filter(
    //       mesh =>
    //         (mesh.metadata !== null &&
    //           Object.hasOwn(mesh.metadata, 'subType') &&
    //           mesh.metadata.subType === 'wall') ||
    //         mesh.name.toLowerCase().includes(this.theme.settings.studioWallMeshesName)
    //     );

    //     // create ray that shoot from center to the back of the mesh
    //     const ray = new Ray(mesh.position, mesh.forward.scale(-1), 0.08);

    //     wallMeshes.forEach(wallMesh => {
    //       const pickingInfoBack = ray.intersectsMesh(wallMesh, true);

    //       if (pickingInfoBack.hit === true) {
    //         if (pickingInfoBack.pickedPoint) {
    //           mesh.position.copyFrom(pickingInfoBack.pickedPoint);
    //         }
    //       }
    //     });
    //   } else if (type !== 'images') {
    //     if (this.gizmoManager.gizmos.positionGizmo?.yGizmo.dragBehavior.dragging !== true) return;

    //     // snap bottom of meshes to any object that's below them
    //     const meshBB = mesh.getHierarchyBoundingVectors();
    //     const rayDown = new Ray(
    //       new Vector3(mesh.position.x, meshBB.min.y, mesh.position.z),
    //       mesh.up.scale(-1),
    //       0.02
    //     );

    //     this.scene.meshes.forEach(sceneMesh => {
    //       if (sceneMesh === mesh) return;

    //       const pickingInfo = rayDown.intersectsMesh(sceneMesh, true);
    //       if (pickingInfo.hit === false || !pickingInfo.pickedPoint) return;

    //       // get top level parent mesh to check if it's an added studio object
    //       let parent = sceneMesh.parent;
    //       while (parent) {
    //         if (!parent.parent) break;
    //         parent = parent.parent;
    //       }

    //       if (parent && this.spaceBuilder.currentObjects.includes(parent as Mesh)) {
    //         // if ray's picked point is inside the bounding box of the mesh, don't snap
    //         const sceneMeshBB = sceneMesh.getHierarchyBoundingVectors(true);
    //         if (
    //           pickingInfo.pickedPoint.y > sceneMeshBB.min.y &&
    //           pickingInfo.pickedPoint.y < sceneMeshBB.max.y
    //         ) {
    //           return;
    //         }
    //         mesh.position.copyFrom(pickingInfo.pickedPoint);
    //       } else {
    //         mesh.position.copyFrom(pickingInfo.pickedPoint);
    //       }
    //     });
    //   }
    // });
  }

  private _cancelGizmoDragging() {
    switch (true) {
      case this.gizmoManager.gizmos.positionGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.positionGizmo?.attachedMesh: {
          this._dragCancelled = true;
          this.gizmoManager.gizmos.positionGizmo.releaseDrag();
          this._handleResetTransform();
          break;
        }
      case this.gizmoManager.gizmos.rotationGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.rotationGizmo?.attachedMesh: {
          this._dragCancelled = true;
          this.gizmoManager.gizmos.rotationGizmo.releaseDrag();
          this._handleResetTransform();
          break;
        }
      case this.gizmoManager.gizmos.scaleGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.scaleGizmo?.attachedMesh: {
          this.gizmoManager.gizmos.scaleGizmo.releaseDrag();
          this._handleResetTransform();
          break;
        }
      case this.gizmoManager.gizmos.boundingBoxGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.boundingBoxGizmo?.attachedMesh: {
          this._dragCancelled = true;
          this.gizmoManager.gizmos.boundingBoxGizmo.releaseDrag();
          this._handleResetTransform();
          break;
        }
    }

    // this.renderScene();
  }

  private _handleResetTransform = () => {
    const attachedMesh = this.gizmoManager.attachedMesh;
    if (!attachedMesh) return;

    if (
      attachedMesh === this.spaceBuilder.objectSelectHandler.selectedMeshGroup
    ) {
      if (
        Object.keys(
          this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms
        ).length > 0
      ) {
        const children = attachedMesh.getChildren();
        for (const child of children as Array<AbstractMesh>) {
          const childId = child.uniqueId;
          if (
            this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms[
            childId
            ]
          ) {
            child.setAbsolutePosition(
              Vector3.FromArray(
                this.spaceBuilder.objectSelectHandler
                  .storedMultiMeshTransforms[childId].absolutePosition
              )
            );
            child.rotation = Quaternion.FromArray(
              this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms[
                childId
              ].absoluteRotationQuaternion
            ).toEulerAngles();
            child.scaling.copyFrom(
              Vector3.FromArray(
                this.spaceBuilder.objectSelectHandler
                  .storedMultiMeshTransforms[childId].absoluteScaling
              )
            );
          }
        }
      }
    } else {
      if (this.spaceBuilder.objectSelectHandler.storedMeshTransforms) {
        attachedMesh.position.copyFrom(
          Vector3.FromArray(
            this.spaceBuilder.objectSelectHandler.storedMeshTransforms
              .absolutePosition
          )
        );
        attachedMesh.rotation.copyFrom(
          Quaternion.FromArray(
            this.spaceBuilder.objectSelectHandler.storedMeshTransforms
              .absoluteRotationQuaternion
          ).toEulerAngles()
        );
        attachedMesh.scaling.copyFrom(
          Vector3.FromArray(
            this.spaceBuilder.objectSelectHandler.storedMeshTransforms
              .absoluteScaling
          )
        );
      }
    }
  };

  detachMeshFromGizmo() {
    if (!this.gizmoManager.attachedMesh) return;

    if (
      this.gizmoManager.attachedMesh ===
      this.spaceBuilder.objectSelectHandler.selectedMeshGroup
    ) {
      const children = this.gizmoManager.attachedMesh.getChildren();
      for (const child of children) {
        // eslint-disable-next-line unicorn/no-null
        (child as AbstractMesh).setParent(null);
      }
    }

    // eslint-disable-next-line unicorn/no-null
    this.gizmoManager.attachToMesh(null);
  }

  detachGizmoFromMesh(mesh: AbstractMesh | Mesh) {
    this.spaceBuilder.objectHighlightHandler.hideObjectOutline(mesh);
    this.detachMeshFromGizmo();
  }

  attachGizmoToGroupNode() {
    // position group node at the center of all children
    const center = Vector3.Zero();
    const childMeshes =
      this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildMeshes();
    const directChildren =
      this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren();

    // calculate center of all children meshes
    for (const child of childMeshes) {
      center.addInPlace(child.getAbsolutePosition());
    }
    center.scaleInPlace(1 / childMeshes.length);

    // remove children from group node, re-position node, then set children again
    // eslint-disable-next-line unicorn/no-null
    for (const child of directChildren) (child as AbstractMesh).setParent(null);
    this.spaceBuilder.objectSelectHandler.selectedMeshGroup.setAbsolutePosition(
      center
    );
    for (const clone of directChildren)
      (clone as AbstractMesh).setParent(
        this.spaceBuilder.objectSelectHandler.selectedMeshGroup
      );

    // attach gizmo to group node
    this.gizmoManager.attachToMesh(
      this.spaceBuilder.objectSelectHandler.selectedMeshGroup as AbstractMesh
    );
  }

  // setUniformScaling(isUniform: boolean) {
  //   if (!this.gizmoManager.gizmos.scaleGizmo) return;

  //   if (isUniform) {
  //     this.gizmoManager.gizmos.scaleGizmo.xGizmo.uniformScaling = true;
  //     this.gizmoManager.gizmos.scaleGizmo.yGizmo.uniformScaling = true;
  //     this.gizmoManager.gizmos.scaleGizmo.zGizmo.uniformScaling = true;
  //   } else {
  //     this.gizmoManager.gizmos.scaleGizmo.xGizmo.uniformScaling = false;
  //     this.gizmoManager.gizmos.scaleGizmo.yGizmo.uniformScaling = false;
  //     this.gizmoManager.gizmos.scaleGizmo.zGizmo.uniformScaling = false;
  //   }
  // }

  storeOldMeshTransforms(): void {
    if (!this.gizmoManager.attachedMesh) return;
    if (
      this.gizmoManager.attachedMesh ===
      this.spaceBuilder.objectSelectHandler.selectedMeshGroup
    ) {
      this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms = {};
      const children =
        this.spaceBuilder.objectSelectHandler.selectedMeshGroup.getChildren();
      for (const child of children as Array<AbstractMesh>) {
        this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms[
          child.uniqueId
        ] = {
          absolutePosition: child.absolutePosition.asArray(),
          absoluteRotationQuaternion:
            child.absoluteRotationQuaternion.asArray(),
          absoluteScaling: child.absoluteScaling.asArray(),
        };
      }
    } else {
      const attachedMesh = this.gizmoManager.attachedMesh;

      this.spaceBuilder.objectSelectHandler.storedMeshTransforms = {
        absolutePosition: attachedMesh.position.asArray(),
        absoluteRotationQuaternion:
          attachedMesh.absoluteRotationQuaternion.asArray(),
        absoluteScaling: attachedMesh.absoluteScaling.asArray(),
      };
    }
  }

  saveTransformState(state: "move" | "rotate" | "scale"): void {
    if (!this.gizmoManager.attachedMesh) return;

    const attachedMesh = this.gizmoManager.attachedMesh;

    if (
      attachedMesh === this.spaceBuilder.objectSelectHandler.selectedMeshGroup
    ) {
      if (
        Object.keys(
          this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms
        ).length === 0
      )
        return;

      const children = attachedMesh.getChildren();
      const newTransforms: Record<string, ObjectAbsoluteTransforms> = {};

      let amountOfUnchangedTransforms: number = 0;

      for (const mesh of children as Array<AbstractMesh>) {
        const oldMeshTransforms =
          this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms[
          mesh.uniqueId
          ];

        if (
          areArraysEqual(
            mesh.absolutePosition.asArray(),
            oldMeshTransforms.absolutePosition
          ) &&
          areArraysEqual(
            mesh.absoluteRotationQuaternion.asArray(),
            oldMeshTransforms.absoluteRotationQuaternion
          ) &&
          areArraysEqual(
            mesh.absoluteScaling.asArray(),
            oldMeshTransforms.absoluteScaling
          )
        ) {
          amountOfUnchangedTransforms++;
        }

        newTransforms[mesh.uniqueId] = {
          absolutePosition: mesh.absolutePosition.asArray(),
          absoluteRotationQuaternion: mesh.absoluteRotationQuaternion.asArray(),
          absoluteScaling: mesh.absoluteScaling.asArray(),
        };
      }

      if (amountOfUnchangedTransforms === children.length) {
        if (clientSettings.DEBUG) {
          console.log(
            "No transform changes in group transforms, not saving state"
          );
        }
        return;
      }

      this.spaceBuilder.saveStateHandler.saveState(state, {
        meshes: children,
        old: this.spaceBuilder.objectSelectHandler.storedMultiMeshTransforms,
        new: newTransforms,
      });

      if (clientSettings.DEBUG) {
        console.log(
          "Saved transform state for group",
          this.spaceBuilder.saveStateHandler.savedStates.at(
            this.spaceBuilder.saveStateHandler.lastStateIndex
          )
        );
      }
    } else {
      if (!this.spaceBuilder.objectSelectHandler.storedMeshTransforms) return;

      const newTransforms: ObjectAbsoluteTransforms = {
        absolutePosition: attachedMesh.absolutePosition.asArray(),
        absoluteRotationQuaternion:
          attachedMesh.absoluteRotationQuaternion?.asArray(),
        absoluteScaling: attachedMesh.absoluteScaling.asArray(),
      };

      // if transforms aren't changed, don't save state
      if (
        areArraysEqual(
          this.spaceBuilder.objectSelectHandler.storedMeshTransforms
            .absolutePosition,
          newTransforms.absolutePosition
        ) &&
        areArraysEqual(
          this.spaceBuilder.objectSelectHandler.storedMeshTransforms
            .absoluteRotationQuaternion,
          newTransforms.absoluteRotationQuaternion
        ) &&
        areArraysEqual(
          this.spaceBuilder.objectSelectHandler.storedMeshTransforms
            .absoluteScaling,
          newTransforms.absoluteScaling
        )
      ) {
        return;
      }

      this.spaceBuilder.saveStateHandler.saveState(state, {
        mesh: attachedMesh,
        old: this.spaceBuilder.objectSelectHandler.storedMeshTransforms,
        new: newTransforms,
      });
    }
  }

  focusCameraOnObjects(
    mesh?: Mesh | AbstractMesh,
    onAnimationEnd?: () => void
  ) {
    const meshToFocus = mesh ?? this.gizmoManager.attachedMesh;

    if (!meshToFocus) return;

    meshToFocus.computeWorldMatrix(true);
    const minMax = meshToFocus.getHierarchyBoundingVectors(true);

    // enable built-in framing behavior
    this.camera.useFramingBehavior = true;
    if (this.camera.framingBehavior) {
      this.camera.framingBehavior.framingTime = 400;
      this.camera.framingBehavior.zoomOnBoundingInfo(
        minMax.min,
        minMax.max,
        undefined,
        () => {
          this.camera.useFramingBehavior = false;
          onAnimationEnd?.();
        }
      );
    }
  }

  private _initKeyboardHandler() {
    return this.scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case KeyboardEventTypes.KEYDOWN: {
          switch (kbInfo.event.code) {
            case "Backspace":
            case "Delete": {
              this.spaceBuilder.deleteObjects();
              break;
            }
            case "Escape": {
              // abort gizmo dragging if is dragging gizmo
              // or unselect object if not dragging
              if (
                this.gizmoManager.gizmos.positionGizmo?.isDragging === true ||
                this.gizmoManager.gizmos.rotationGizmo?.isDragging === true ||
                this.gizmoManager.gizmos.scaleGizmo?.isDragging === true ||
                this.gizmoManager.gizmos.boundingBoxGizmo?.isDragging === true
              ) {
                this._cancelGizmoDragging();
              }
              break;
            }
            case "Period": {
              this.focusCameraOnObjects();
              break;
            }
            case "KeyG": {
              // change to location gizmo
              this.setGizmoType("location");
              this.onSetGizmoTypeObservable.notifyObservers("location");
              break;
            }
            case "KeyR": {
              // change to rotation gizmo
              this.setGizmoType("rotation");
              this.onSetGizmoTypeObservable.notifyObservers("rotation");
              break;
            }
            case "KeyS": {
              // change to scale gizmo
              this.setGizmoType("scale");
              this.onSetGizmoTypeObservable.notifyObservers("scale");
              break;
            }
          }
          break;
        }
      }
    });
  }

  dispose(): void {
    this._gizmoDragSceneRenderObservable?.remove();
    this._gizmoDragSceneRenderObservable = undefined;

    this.gizmoManager.dispose();
    this.scene.onKeyboardObservable.clear();
  }
}

export default GizmoHandler;
