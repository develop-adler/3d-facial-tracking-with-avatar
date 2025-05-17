import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader"; // models with ktx2 textures
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader"; // skybox
import "@babylonjs/core/Physics/v2/physicsEngineComponent"; // for creating physics bodies
import "@babylonjs/core/Layers/effectLayerSceneComponent"; // for HighlightLayer
import "@babylonjs/core/Shaders/pass.fragment"; // for HighlightLayer
import "@babylonjs/core/Shaders/glowBlurPostProcess.fragment"; // for HighlightLayer

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { GPUPicker } from "@babylonjs/core/Collisions/gpuPicker";
// import { Ray } from '@babylonjs/core/Culling/ray';
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable } from "@babylonjs/core/Misc/observable";
import { ScreenshotTools } from "@babylonjs/core/Misc/screenshotTools";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { UtilityLayerRenderer } from "@babylonjs/core/Rendering/utilityLayerRenderer";
import { Scene } from "@babylonjs/core/scene";
import { GridMaterial } from "@babylonjs/materials";

import { AdlerEngine } from "./AdlerEngine";
import { OrbitGizmo } from "./AdlerStudio/OrbitGizmo";
import { Avatar } from "../Avatar/Avatar";
import { AvatarController } from "../Avatar/AvatarController";

import { fetchUserAvatarInfo } from "@/apis/avatar";
import type {
  Asset,
  AtomTheme,
  AtomThemeSettings,
  AvatarGender,
  Content,
  GizmoTransformationType,
  HyperLinkData,
  ObjectTransformType,
  StudioMeshMetaData,
  StudioObject,
  StudioObjectSubType,
  StudioObjectType,
  StudioPost,
  StudioSavedStates,
  StudioSavedStateType,
  StudioSpaceProperty,
} from "@/apis/entities";
import eventBus from "@/eventBus";
import type { LockedStudioObjects } from "@/stores/useStudioEditStore";
import { isFirefox, isMobile, isSafari } from "@/utils/browserUtils";
import {
  areArraysEqual,
  getRandomFloatBetween,
  getRandomIntBetween,
  // isArcRotateCameraStopped,
  lerp,
  waitForConditionAndExecute,
} from "@/utils/functionUtils";

import { clientSettings } from "clientSettings";
import {
  ATOM_THEME_SETTINGS,
  AVATAR_PARAMS,
  COLOR,
  MAX_UNDO_REDO_COUNT,
  PHYSICS_SHAPE_FILTER_GROUPS,
  STUDIO_DEFAULT_SKYBOX,
  STUDIO_OBJECT_TYPE_DICTIONARY,
  // THUMBNAIL_HEIGHT,
  THUMBNAIL_RESOLUTIONS,
  // THUMBNAIL_WIDTH,
  WORLD_GRAVITY,
} from "constant";

import avatarJSON from "#/static/avatar/avatar.json";

import type { EngineCoreType as EngineCore } from "./EngineCore";
import type { Resource } from "../AtomResources";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Node } from "@babylonjs/core/node";
import type { Nullable } from "@babylonjs/core/types";
import type { HavokPhysicsWithBindings } from "@babylonjs/havok";
import { v4 } from "uuid";

type ObjectAbsoluteTransforms = {
  absolutePosition: [number, number, number];
  absoluteRotationQuaternion: [number, number, number, number];
  absoluteScaling: [number, number, number];
};
type CameraSettings = {
  fov: number;
  target: ObjectTransform;
  position: ObjectTransform;
};
type AxisGizmoDragEvent = {
  delta: Vector3;
  dragPlanePoint: Vector3;
  dragPlaneNormal: Vector3;
  dragDistance: number;
  pointerId: number;
  pointerInfo: Nullable<PointerInfo>;
};
type ThumbnailDeviceType = "pc" | "mobile" | "tablet";
export type ThumbnailScreenshots = {
  pc: Blob;
  mobile: Blob;
  tablet: Blob;
};
type KeyStatus = {
  KeyW: boolean;
  ArrowUp: boolean;
  KeyA: boolean;
  ArrowLeft: boolean;
  KeyS: boolean;
  ArrowRight: boolean;
  KeyD: boolean;
  ArrowDown: boolean;
};

// because importing from '@babylonjs/core/Gizmos/gizmo' increases bundle size too much
enum GizmoAnchorPoint {
  /** The origin of the attached node */
  Origin = 0,
  /** The pivot point of the attached node*/
  Pivot = 1,
}

// const POINTER_INFO: {
//   isPointerDown: boolean;
//   isPointerMoving: boolean;
//   checkPointerMoveTimeout: Nullable<NodeJS.Timeout>;
// } = {
//   isPointerDown: false,
//   isPointerMoving: false,
//   checkPointerMoveTimeout: null,
// };

const IDLE_TIMEOUT = 2000;

/** AdlerStudioEngine: This gets loaded in adler studio editor page */
export class AdlerStudioEngine extends AdlerEngine {
  scene: Scene;
  orbitGizmo: OrbitGizmo;
  utilityLayer: UtilityLayerRenderer;
  camera: ArcRotateCamera;
  skybox: Mesh;
  floorGrid: Mesh;
  gizmoManager: GizmoManager;
  gpuPicker?: GPUPicker;
  highlightLayer: HighlightLayer;
  userSpawnPlane: Nullable<TransformNode> = null;
  avatarCamera: ArcRotateCamera; // for preview mode
  editSpawnAreaCamera: ArcRotateCamera; // for edit spawn area mode
  thumbnailCamera: Nullable<ArcRotateCamera> = null; // for thumbnail capture mode
  savedStates: StudioSavedStates = [];
  currentStateIndex: number = 0;

  currentGizmoType: GizmoTransformationType = "location";
  currentSkyboxData!: Asset;
  postData?: StudioSpaceProperty;
  currentObjects: Array<AbstractMesh | Mesh> = [];
  lockedObjects: Array<number> = [];
  copiedMesh: Nullable<Mesh | AbstractMesh> = null;
  private _addedObjectsPhysicsAggregates: Array<PhysicsAggregate> = [];
  selectedMeshGroup: TransformNode;

  isPreviewMode: boolean = false;
  isThumbnailCaptureMode: boolean = false;
  isEditSpawnAreaMode: boolean = false;
  isIdle: boolean = false;
  idleTimeout: Nullable<NodeJS.Timeout> = null;

  avatar: Nullable<Avatar> = null;
  avatarController: Nullable<AvatarController> = null;

  private _isSpawnAreaUpdated: boolean = false;
  private _previousSpawnPlaneTransforms: Nullable<{
    position: Vector3;
    rotation: Vector3;
    scaling: Vector3;
  }> = null;
  oldSelectedMesh: Nullable<AbstractMesh> = null; // for edit spawn area mode
  storedMeshTransforms: Nullable<ObjectAbsoluteTransforms> = null;
  storedMultiMeshTransforms: Record<string, ObjectAbsoluteTransforms> = {};

  theme: {
    id: string;
    position: ObjectTransform;
    rotation: ObjectTransform;
    scale: ObjectTransform;
    userSpawnInfo: {
      target: ObjectTransform;
      corners: [
        ObjectTransform,
        ObjectTransform,
        ObjectTransform,
        ObjectTransform
      ];
    };
    name: AtomTheme;
    atomRoot: Nullable<AbstractMesh>;
    atomMeshes: Array<AbstractMesh | Mesh>;
    settings: AtomThemeSettings;
    physicsAggregates: Array<PhysicsAggregate>;
  };
  cameraFrontViewSettings?: CameraSettings;
  dontRenderScene: boolean = false;
  forceRenderScene: boolean = false;

  private _movedCamera: boolean = false;
  private _pannedCamera: boolean = false;
  private _dragCancelled: boolean = false;
  private _pointerUpEnabled: boolean = true;
  private _pointerUpCooldown: Nullable<NodeJS.Timeout> = null;
  private _gizmoDragSceneRenderObservable: Nullable<Observer<Scene>> = null;
  private _pickPointerObservable: Nullable<Observer<PointerInfo>> = null;
  private readonly _hLinkAnchorRotationObservers: Map<
    AbstractMesh,
    Observer<Scene>
  > = new Map();

  // observables to trigger 2D UI updates
  readonly onObjectDuplicateObservable: Observable<
    AbstractMesh | Array<AbstractMesh>
  > = new Observable();
  readonly onSetObjectLockObservable: Observable<LockedStudioObjects> =
    new Observable();
  readonly onSetPreviewModeObservable: Observable<boolean> = new Observable();
  readonly onSetGizmoTypeObservable: Observable<GizmoTransformationType> =
    new Observable();
  readonly onSetSelectedObjectObservable: Observable<
    AbstractMesh | Mesh | null
  > = new Observable();
  readonly onSetShowContextMenuObservable: Observable<{
    show: boolean;
    position: Vector2 | null;
  }> = new Observable();
  readonly onSaveStateObservable: Observable<{
    savedStates: StudioSavedStates;
    currentStateIndex: number;
  }> = new Observable();
  readonly onSetObjectTransformObservable: Observable<
    Record<ObjectTransformType, ObjectTransform>
  > = new Observable();

  private readonly _keyDown = {
    escape: false,
    shift: false,
    control: false,
    meta: false, // mac's command key
  };
  private _keyPressRenderObservable: Nullable<Observer<Scene>> = null;
  private _keyStatus: KeyStatus = {
    KeyW: false,
    ArrowUp: false,
    KeyA: false,
    ArrowLeft: false,
    KeyS: false,
    ArrowRight: false,
    KeyD: false,
    ArrowDown: false,
  };

  private _isDraftLoaded: boolean = false;
  private readonly _onDraftLoadedObservers: Observable<void> = new Observable();

  private static readonly DRAG_SENSITIVITY_LOW = 0.1;
  private static readonly DRAG_SENSITIVITY_NORMAL = 1;
  private static readonly DEFAULT_ZOOM_PRECISION = 80;

  private static readonly SELECT_LOCKED_COLOR = new Color3(1, 0.4, 0);
  private static readonly SELECT_UNLOCKED_COLOR = Color3.Green();
  private static readonly AXIS_X_COLOR = Color3.FromHexString(
    COLOR.brandPrimary
  );
  private static readonly AXIS_Y_COLOR = Color3.FromHexString(
    COLOR.studioYGizmo
  );
  private static readonly AXIS_Z_COLOR = Color3.FromHexString(
    COLOR.studioZGizmo
  );

  constructor(engineCore: EngineCore) {
    super(engineCore);

    this.theme = {
      id: "",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      userSpawnInfo: {
        target: ATOM_THEME_SETTINGS["custom"].userSpawnInfo.target,
        corners: ATOM_THEME_SETTINGS["custom"].userSpawnInfo.corners,
      },
      name: "custom",
      atomRoot: null,
      atomMeshes: [],
      settings: ATOM_THEME_SETTINGS["custom"],
      physicsAggregates: [],
    };

    this.scene = this._createScene();
    this.camera = this._createMainCamera(
      "editCamera",
      this.scene,
      this.theme.settings.defaultFrontView
    );
    this.floorGrid = this._createFloorGrid();
    this.utilityLayer = this._createUtilityLayer(this.scene, this.camera);

    this.highlightLayer = this._createHighlightLayer(this.camera);
    this.editSpawnAreaCamera = this._createOtherCamera("editSpawnAreaCamera");
    this.avatarCamera = this._createAvatarCamera();
    this.skybox = this._createSkyboxMesh();
    this.gizmoManager = this._createGizmoManager(this.utilityLayer);
    this.orbitGizmo = new OrbitGizmo(this.scene, this.camera);

    this.selectedMeshGroup = new TransformNode(
      "selectedMeshGroup",
      this.scene,
      true
    );

    // use GPUPicker if browser is not Safari
    if (!isSafari()) {
      this.gpuPicker = new GPUPicker();

      this.scene.skipPointerMovePicking = true;
      this.scene.skipPointerDownPicking = true;
      this.scene.skipPointerUpPicking = true;
    }
    this.setupPointerPickBehavior();

    // fix weird bug where first pick with on-demand rendering doesn't work
    this.gpuPicker?.pickAsync(0, 0);

    this.setActive(true);
  }

  get isDraftLoaded(): boolean {
    return this._isDraftLoaded;
  }

  increaseCameraZoomSpeed(): void {
    this.camera.wheelPrecision = 10;
    if (this.thumbnailCamera) this.thumbnailCamera.wheelPrecision = 10;
  }

  decreaseCameraZoomSpeed(): void {
    this.camera.wheelPrecision = 250;
    if (this.thumbnailCamera) this.thumbnailCamera.wheelPrecision = 250;
  }

  resetCameraZoomSpeed(): void {
    this.camera.wheelPrecision = AdlerStudioEngine.DEFAULT_ZOOM_PRECISION;
    if (this.thumbnailCamera)
      this.thumbnailCamera.wheelPrecision =
        AdlerStudioEngine.DEFAULT_ZOOM_PRECISION;
  }

  private _createScene(): Scene {
    const scene = new Scene(this.engine, {
      useGeometryUniqueIdsMap: true,
    });

    scene.autoClear = false; // Color buffer
    scene.autoClearDepthAndStencil = false; // Depth and stencil

    // set scene background color to white
    scene.clearColor = new Color4(1.0, 1.0, 1.0, 1.0);

    this.engine.clear(scene.clearColor, true, true);

    // for avatar occlusion culling
    scene.setRenderingAutoClearDepthStencil(1, false, false, false);

    // Enable physics
    const enableHavokPhysics = (havok: HavokPhysicsWithBindings) => {
      // pass the havok physics engine to the plugin
      const havokPlugin = new HavokPlugin(true, havok);

      const gravityVector = new Vector3(0, WORLD_GRAVITY, 0);

      // enable physics in the scene with a gravity
      scene.enablePhysics(gravityVector, havokPlugin);
    };

    if (this.engineCore.havok) {
      enableHavokPhysics(this.engineCore.havok);
    } else {
      // load havok physics engine
      // let path = `${clientSettings.PUBLIC_FOLDER_DOMAIN}babylonjs/havok/HavokPhysics.wasm`;
      // if (isIOS() || isFirefox()) {
      //   path = '/babylonjs/havok/HavokPhysics.wasm';
      // }
      // HavokPhysics({ locateFile: () => path }).then(havok => {
      import("@babylonjs/havok").then(({ default: HavokPhysics }) => {
        HavokPhysics().then((havok) => {
          this.engineCore.havok = havok;
          eventBus.emitWithDelegation("havok:ready", havok);
          enableHavokPhysics(havok);
        });
      });
    }

    // keyboard events
    scene.onKeyboardObservable.add((kbInfo) => {
      if (kbInfo.type === 2) {
        this._startIdleTimeout();
      } else if (this.isIdle) this.isIdle = false;

      if (this.isPreviewMode === true) {
        if (kbInfo.event.code === "Escape") {
          this.setPreviewMode(false);
          this.onSetPreviewModeObservable.notifyObservers(false);
        }
        return;
      }

      switch (kbInfo.type) {
        case KeyboardEventTypes.KEYDOWN: {
          const keyCode = kbInfo.event.code;
          if (keyCode in this._keyStatus) {
            this._keyStatus[keyCode as keyof KeyStatus] = true;

            const forward =
              !!this._keyStatus["KeyW"] || !!this._keyStatus["ArrowUp"];
            const backward =
              !!this._keyStatus["KeyS"] || !!this._keyStatus["ArrowDown"];
            const left =
              !!this._keyStatus["KeyA"] || !!this._keyStatus["ArrowLeft"];
            const right =
              !!this._keyStatus["KeyD"] || !!this._keyStatus["ArrowRight"];

            this.forceRenderScene =
              forward || backward || left || right ? true : false;
          }

          switch (kbInfo.event.code) {
            case "ShiftLeft": {
              this._keyDown.shift = true;
              break;
            }
            case "ControlLeft": {
              this._keyDown.control = true;
              break;
            }
            case "MetaLeft": {
              this._keyDown.meta = true;
              break;
            }
            case "Backspace":
            case "Delete": {
              this.deleteObjects();
              break;
            }
            case "Escape": {
              this._keyDown.escape = true;

              // abort gizmo dragging if is dragging gizmo
              // or unselect object if not dragging
              if (
                this.gizmoManager.gizmos.positionGizmo?.isDragging === true ||
                this.gizmoManager.gizmos.rotationGizmo?.isDragging === true ||
                this.gizmoManager.gizmos.scaleGizmo?.isDragging === true ||
                this.gizmoManager.gizmos.boundingBoxGizmo?.isDragging === true
              ) {
                this._cancelGizmoDragging();
              } else if (!this.isEditSpawnAreaMode) {
                this.unselectAllObjects(true);
              }
              break;
            }
            case "Period": {
              this.focusCameraOnObjects();
              break;
            }
            case "KeyC": {
              if (this._keyDown.control || this._keyDown.meta) {
                this.copyObjects();
              }
              break;
            }
            case "KeyV": {
              if (this._keyDown.control || this._keyDown.meta) {
                this.pasteObjects();
              }
              break;
            }
            case "KeyZ": {
              if (
                (this._keyDown.control || this._keyDown.meta) &&
                this._keyDown.shift
              ) {
                this.redo();
              } else if (this._keyDown.control || this._keyDown.meta) {
                this.undo();
              }
              break;
            }
            case "KeyY": {
              if (this._keyDown.control || this._keyDown.meta) {
                this.redo();
              }
              break;
            }
            case "KeyL": {
              if (
                this.gizmoManager.attachedMesh &&
                this.gizmoManager.attachedMesh !== this.selectedMeshGroup
              ) {
                this.toggleObjectLock(this.gizmoManager.attachedMesh);
              } else if (
                this.gizmoManager.attachedMesh === this.selectedMeshGroup
              ) {
                this.toggleMultiObjectsLock(
                  this.selectedMeshGroup.getChildren()
                );
              }
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
        case KeyboardEventTypes.KEYUP: {
          const keyCode = kbInfo.event.code;
          if (keyCode in this._keyStatus) {
            this._keyStatus[keyCode as keyof KeyStatus] = false;
          }

          switch (kbInfo.event.code) {
            case "ShiftLeft": {
              this._keyDown.shift = false;
              break;
            }
            case "ControlLeft": {
              this._keyDown.control = false;
              break;
            }
            case "MetaLeft": {
              this._keyDown.meta = false;
              break;
            }
            case "Escape": {
              this._keyDown.escape = false;
              break;
            }
          }
          break;
        }
      }
    });

    return scene;
  }

  private _createFloorGrid(): Mesh {
    const ground = CreateGround(
      "ground",
      { width: 10000, height: 10000 },
      this.scene
    );
    ground.isPickable = false;
    ground.doNotSyncBoundingInfo = true;
    ground.freezeWorldMatrix();
    ground.alwaysSelectAsActiveMesh = true;
    ground.layerMask = 1 << 1; // visible on layer 2

    const gridMaterial = new GridMaterial("gridMaterial", this.scene);
    gridMaterial.majorUnitFrequency = 5; // Space between major lines
    gridMaterial.minorUnitVisibility = 0.45; // Visibility of minor lines
    gridMaterial.gridRatio = 1; // Scale of grid units
    gridMaterial.backFaceCulling = false; // Render both sides
    gridMaterial.mainColor = new Color3(1, 1, 1); // Color of main lines
    gridMaterial.lineColor = new Color3(0.75, 0.75, 0.75); // Color of minor lines
    gridMaterial.opacity = 0.8; // set transparency
    gridMaterial.fogEnabled = true; // fade edges
    gridMaterial.freeze();

    ground.material = gridMaterial;
    return ground;
  }

  private _createHighlightLayer(camera: ArcRotateCamera): HighlightLayer {
    const hl = new HighlightLayer("highlightLayer", this.scene, {
      camera,
      // isStroke: true, // commented because it looks ugly
      blurHorizontalSize: 0.6,
      blurVerticalSize: 0.6,
    });
    return hl;
  }

  private _createUtilityLayer(
    scene: Scene,
    camera: ArcRotateCamera
  ): UtilityLayerRenderer {
    const utilLayer = new UtilityLayerRenderer(scene);
    utilLayer.utilityLayerScene.autoClearDepthAndStencil = true;
    utilLayer.setRenderCamera(camera);
    return utilLayer;
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

    gizmoManager.attachableMeshes = null;

    // disable default pointer attach behavior
    gizmoManager.usePointerToAttachGizmos = false;

    gizmoManager.onAttachedToMeshObservable.add((mesh) => {
      if (!mesh) {
        this.onSetSelectedObjectObservable.notifyObservers(null);
        // this.renderScene();
        return;
      }

      if (mesh === this.selectedMeshGroup) {
        this.setGizmoType(this.currentGizmoType);
        this.onSetSelectedObjectObservable.notifyObservers(null);
        return;
      }

      const meshMetadata = mesh.metadata as StudioMeshMetaData;

      // switch gizmo axis based on object type
      this._updateGizmoAxis(meshMetadata.type, meshMetadata.subType);

      // handle object lock/unlock state
      this.handleObjectLockState(mesh);

      this.onSetSelectedObjectObservable.notifyObservers(mesh);
      this.updateObjectTransform2D(mesh);

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

      posGizmo.xGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_X_COLOR;
      posGizmo.yGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_Y_COLOR;
      posGizmo.zGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_Z_COLOR;

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
        AdlerStudioEngine.AXIS_X_COLOR;
      rotationGizmo.yGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_Y_COLOR;
      rotationGizmo.zGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_Z_COLOR;

      rotationGizmo.xGizmo.coloredMaterial.freeze();
      rotationGizmo.yGizmo.coloredMaterial.freeze();
      rotationGizmo.zGizmo.coloredMaterial.freeze();
    }

    if (gizmoManager.gizmos.scaleGizmo) {
      const scaleGizmo = gizmoManager.gizmos.scaleGizmo;

      scaleGizmo.xGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_X_COLOR;
      scaleGizmo.yGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_Y_COLOR;
      scaleGizmo.zGizmo.coloredMaterial.emissiveColor =
        AdlerStudioEngine.AXIS_Z_COLOR;

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
        if (this.isIdle) this.isIdle = false;
        if (
          pointerInfo.event.type === "mouseup" ||
          pointerInfo.event.type === "pointerup"
        ) {
          this._startIdleTimeout();
        }

        if (this.isPreviewMode || this.isThumbnailCaptureMode) return;

        // prevent object selection in edit user spawn area mode
        if (
          this.isEditSpawnAreaMode &&
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

        // register right click
        if (pointerInfo.event.button === 2) {
          switch (pointerInfo.event.type) {
            case "mousedown":
            case "pointerdown": {
              this._pannedCamera = false;
              break;
            }
            case "mouseup":
            case "pointerup": {
              if (this._pannedCamera || this.gizmoManager.attachedMesh === null)
                break;
              this.onSetShowContextMenuObservable.notifyObservers({
                show: true,
                position: {
                  x: pointerInfo.event.clientX,
                  y: pointerInfo.event.clientY,
                },
              });
              break;
            }
          }
        }

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

            if (this.orbitGizmo.isSphereClicked === true) break;

            const handleSelectObject = (mesh?: Nullable<AbstractMesh>) => {
              if (!mesh) {
                this.unselectAllObjects(true);
                // this.renderScene();
                return;
              }

              const selectSingleObject = (meshToAttach: AbstractMesh) => {
                this.selectedMeshGroup.getChildren().forEach((child) => {
                  (child as AbstractMesh).setParent(null);
                  this.hideObjectOutline(child as AbstractMesh);
                });

                // single mesh select
                // don't re-select same mesh
                if (meshToAttach === this.gizmoManager.attachedMesh) return;

                this.hideObjectOutline(this.gizmoManager.attachedMesh);
                this.gizmoManager.attachToMesh(meshToAttach);

                this.saveState("select", {
                  mesh: meshToAttach,
                });
              };

              // get the top level parent mesh of mesh
              let newMeshToAttach = mesh;
              if (newMeshToAttach.parent) {
                while (newMeshToAttach.parent) {
                  // if is group node, ignore
                  if (newMeshToAttach.parent === this.selectedMeshGroup) {
                    break;
                  }
                  newMeshToAttach = newMeshToAttach.parent as AbstractMesh;
                }
              }

              // multiple mesh select
              if (this._keyDown.control && this.gizmoManager.attachedMesh) {
                // if clicked mesh is children of group node, remove from group node instead
                if (
                  this.selectedMeshGroup.getChildren().includes(newMeshToAttach)
                ) {
                  newMeshToAttach.setParent(null);
                  this.hideObjectOutline(newMeshToAttach);

                  // if group node only has 1 child, attach to mesh directly instead
                  if (this.selectedMeshGroup.getChildren().length === 1) {
                    const child =
                      this.selectedMeshGroup.getChildren()[0] as AbstractMesh;
                    child.setParent(null);
                    selectSingleObject(child);
                    return;
                  }

                  this.saveState("select", {
                    meshes: this.selectedMeshGroup.getChildren(),
                  });

                  // position group node at the center of all children
                  const center = Vector3.Zero();
                  const childMeshes = this.selectedMeshGroup.getChildMeshes();
                  const directChildren = this.selectedMeshGroup.getChildren();

                  childMeshes.forEach((child) => {
                    center.addInPlace(child.getAbsolutePosition());
                  });
                  center.scaleInPlace(1 / childMeshes.length);

                  // remove children from group node, set group node position, then re-add children again
                  directChildren.forEach((child) =>
                    (child as AbstractMesh).setParent(null)
                  );
                  this.selectedMeshGroup.setAbsolutePosition(center);
                  directChildren.forEach((child) =>
                    (child as AbstractMesh).setParent(this.selectedMeshGroup)
                  );
                } else if (
                  this.gizmoManager.attachedMesh === this.selectedMeshGroup
                ) {
                  // if selected mesh is group already, add new mesh to group

                  // position group node at the center of all children
                  const center = Vector3.Zero();
                  const childMeshes = this.selectedMeshGroup.getChildMeshes();
                  childMeshes.push(newMeshToAttach);
                  childMeshes.forEach((child) => {
                    center.addInPlace(child.getAbsolutePosition());
                  });
                  center.scaleInPlace(1 / childMeshes.length);

                  // remove children from group node, set group node position,
                  // then re-add children, including the new mesh
                  const directChildren = this.selectedMeshGroup.getChildren();
                  directChildren.forEach((child) =>
                    (child as AbstractMesh).setParent(null)
                  );
                  this.selectedMeshGroup.setAbsolutePosition(center);
                  directChildren.push(newMeshToAttach);
                  directChildren.forEach((child) =>
                    (child as AbstractMesh).setParent(this.selectedMeshGroup)
                  );

                  this.saveState("select", {
                    meshes: this.selectedMeshGroup.getChildren(),
                  });
                } else {
                  // if selected mesh is single mesh, add to group node and attach gizmo to group node
                  if (newMeshToAttach === this.gizmoManager.attachedMesh)
                    return;

                  // position group node at the center of all children
                  const center = Vector3.Zero();
                  [this.gizmoManager.attachedMesh, newMeshToAttach].forEach(
                    (mesh) => {
                      center.addInPlace(mesh.getAbsolutePosition());
                    }
                  );
                  center.scaleInPlace(0.5); // average position
                  this.selectedMeshGroup.setAbsolutePosition(center);

                  this.gizmoManager.attachedMesh.setParent(
                    this.selectedMeshGroup
                  );
                  newMeshToAttach.setParent(this.selectedMeshGroup);

                  this.gizmoManager.attachToMesh(
                    this.selectedMeshGroup as AbstractMesh
                  );

                  this.saveState("select", {
                    meshes: this.selectedMeshGroup.getChildren(),
                  });
                }

                // show outline for all objects in group
                this.showObjectOutlineForGroup(
                  this.selectedMeshGroup.getChildren()
                );

                if (clientSettings.DEBUG) {
                  console.log(
                    "Selected group:",
                    this.selectedMeshGroup,
                    this.selectedMeshGroup
                      .getChildren()
                      .map((child) => child.metadata.name)
                  );
                }

                return;
              }

              selectSingleObject(newMeshToAttach);

              // this.renderScene();
            };

            if (this.gpuPicker) {
              // this.renderScene();
              this.gpuPicker
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

  private _createMainCamera(
    name: string,
    scene: Scene,
    settings: CameraSettings
  ): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      name,
      -Math.PI * 0.5,
      Math.PI * 0.5,
      30,
      Vector3.FromArray(settings.target),
      scene
    );
    camera.setPosition(Vector3.FromArray(settings.position));
    camera.fov = settings.fov;

    camera.layerMask = 1 << 1; // see meshes on layer 2

    // prevent clipping
    camera.minZ = 0.1;
    camera.maxZ = 450;

    // disable rotation using keyboard arrow key
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];

    // zooming
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 100;

    // zoom sensitivity (lower = faster zoom)
    camera.wheelPrecision = AdlerStudioEngine.DEFAULT_ZOOM_PRECISION;

    // panning sensitivity
    camera.panningSensibility = 250;

    // lower rotation sensitivity, higher value = less sensitive
    camera.angularSensibilityX =
      AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;
    camera.angularSensibilityY =
      AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;

    // unlock vertical range
    camera.lowerBetaLimit = 0;
    camera.upperBetaLimit = Math.PI;

    camera.setTarget(
      Vector3.FromArray(this.theme.settings.defaultFrontView.target)
    );
    camera.setPosition(
      Vector3.FromArray(this.theme.settings.defaultFrontView.position)
    );

    scene.activeCamera = camera;

    // scene.detachControl();
    // this.engineCore.engine.inputElement = this.engineCore.canvas;
    // scene.attachControl();
    camera.attachControl();

    // scene.registerBeforeRender(() => {
    //   console.log(camera.position, camera.target);
    // });

    // allow camera movement with keyboard keys
    this._keyPressRenderObservable = scene.onBeforeRenderObservable.add(() => {
      if (this.isPreviewMode || this.isThumbnailCaptureMode) return;

      // keyboard controls
      const forward = !!this._keyStatus["KeyW"] || !!this._keyStatus["ArrowUp"];
      const backward =
        !!this._keyStatus["KeyS"] || !!this._keyStatus["ArrowDown"];
      const left = !!this._keyStatus["KeyA"] || !!this._keyStatus["ArrowLeft"];
      const right =
        !!this._keyStatus["KeyD"] || !!this._keyStatus["ArrowRight"];

      const forwardBackwardSpeed = 0.05;
      if (forward) {
        camera.setPosition(
          camera.globalPosition.addInPlace(
            camera
              .getDirection(new Vector3(0, 0, 1))
              .scale(forwardBackwardSpeed)
          )
        );
        camera.target = camera.target.addInPlace(
          camera.getDirection(new Vector3(0, 0, 1)).scale(forwardBackwardSpeed)
        );
      }
      if (backward) {
        camera.setPosition(
          camera.globalPosition.subtractInPlace(
            camera
              .getDirection(new Vector3(0, 0, 1))
              .scale(forwardBackwardSpeed)
          )
        );
        camera.target = camera.target.subtractInPlace(
          camera.getDirection(new Vector3(0, 0, 1)).scale(forwardBackwardSpeed)
        );
      }
      if (left) camera.inertialPanningX -= 0.01;
      if (right) camera.inertialPanningX += 0.01;
    });

    return camera;
  }

  private _createAvatarCamera(): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      "avatarCamera",
      -Math.PI * 0.5,
      Math.PI * 0.5,
      10,
      Vector3.Zero(),
      this.scene
    );

    camera.panningSensibility = 0;
    camera.position = new Vector3(
      0,
      AVATAR_PARAMS.CAPSULE_HEIGHT_AVERAGE * 1.25,
      0
    );

    // prevent clipping
    camera.minZ = 0.1;
    camera.maxZ = 500;

    // disable rotation using keyboard arrow key
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];

    // lower zooming sensitivity on mobile
    camera.pinchPrecision = 200;
    camera.wheelPrecision = 100;

    const aspectRatio = this.engine.getAspectRatio(camera);
    camera.fov =
      aspectRatio > 0.7
        ? AvatarController.FOV_THIRDPERSON
        : AvatarController.FOV_THIRDPERSON_MOBILE;

    // camera min distance and max distance
    camera.lowerRadiusLimit = 0;
    camera.upperRadiusLimit = AVATAR_PARAMS.CAMERA_RADIUS_UPPER_AVATAR;

    //  lower rotation sensitivity, higher value = less sensitive
    camera.angularSensibilityX = isMobile()
      ? AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR_MOBILE
      : AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;
    camera.angularSensibilityY = isMobile()
      ? AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR_MOBILE
      : AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;

    // limit up and down rotation range
    camera.lowerBetaLimit = AVATAR_PARAMS.CAMERA_BETA_LOWER_LIMIT_AVATAR; // looking down (divided by lower value = lower angle)
    camera.upperBetaLimit = AVATAR_PARAMS.CAMERA_BETA_UPPER_LIMIT_AVATAR; // looking up (divided by higher value = lower angle)

    // remove horizontal rotation limitation
    camera.lowerAlphaLimit = null;
    camera.upperAlphaLimit = null;

    return camera;
  }

  private _createOtherCamera(
    name: string = "thumbnailCamera",
    fov?: number,
    position?: Vector3,
    target?: Vector3
  ): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      name,
      -Math.PI * 0.5,
      Math.PI * 0.5,
      30,
      target ?? Vector3.Zero(),
      this.scene
    );
    camera.setPosition(position ?? new Vector3(10, 10, 10));
    camera.fov = fov ?? 0.8;

    if (name === "thumbnailCamera") {
      camera.layerMask = 1 << 2; // see meshes on layer 2
    } else if (name === "editSpawnAreaCamera") {
      camera.layerMask = 1 << 3; // see meshes on layer 3
    }

    // prevent clipping
    camera.minZ = 0.1;
    camera.maxZ = 500;

    // disable rotation using keyboard arrow key
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];

    // camera zoom radius limits
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 100;

    // zoom sensitivity (lower = faster zoom)
    camera.wheelPrecision = AdlerStudioEngine.DEFAULT_ZOOM_PRECISION;

    // panning sensitivity
    camera.panningSensibility = 250;

    // lower rotation sensitivity, higher value = less sensitive
    camera.angularSensibilityX =
      AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;
    camera.angularSensibilityY =
      AVATAR_PARAMS.CAMERA_HORIZONTAL_ROTATION_SPEED_AVATAR;

    camera.detachControl();

    return camera;
  }

  private _createSkyboxMesh(): Mesh {
    this.scene.environmentIntensity = 1;

    // Skybox mesh
    const skybox = CreateBox("skybox", { size: 1000 }, this.scene);

    const hdrSkyboxMaterial = new PBRMaterial("hdrSkyBoxMat", this.scene);
    hdrSkyboxMaterial.backFaceCulling = false;
    hdrSkyboxMaterial.microSurface = 1.0;
    hdrSkyboxMaterial.disableLighting = true;
    hdrSkyboxMaterial.twoSidedLighting = true;
    hdrSkyboxMaterial.freeze();
    skybox.material = hdrSkyboxMaterial;

    skybox.isPickable = false;
    skybox.infiniteDistance = true;
    skybox.ignoreCameraMaxZ = true;
    skybox.alwaysSelectAsActiveMesh = true;
    skybox.doNotSyncBoundingInfo = true;
    skybox.freezeWorldMatrix();
    skybox.convertToUnIndexedMesh();

    return skybox;
  }

  private _createUserSpawnPlane(customPoints?: Array<Vector3>): TransformNode {
    // create rectangle from 4 points
    const options = {
      points: customPoints ?? [
        Vector3.FromArray(this.theme.userSpawnInfo.corners[0]),
        Vector3.FromArray(this.theme.userSpawnInfo.corners[1]),
        Vector3.FromArray(this.theme.userSpawnInfo.corners[2]),
        Vector3.FromArray(this.theme.userSpawnInfo.corners[3]),
        Vector3.FromArray(this.theme.userSpawnInfo.corners[0]),
      ],
      updatable: false,
    };

    const plane = CreateLines("userSpawnPlane", options, this.scene);
    plane.color = Color3.Red();
    // plane.metadata = { isUserSpawnPlane: true };
    plane.layerMask = 1 << 3; // visible on layer 3
    plane.renderingGroupId = 2;

    // get center point of the plane
    const center = plane.getBoundingInfo().boundingBox.centerWorld;

    const tNode = new TransformNode("userSpawnPlaneTNode", this.scene);
    tNode.metadata = { isUserSpawnPlane: true };

    // set node position to be center of plane
    tNode.position = center;

    // set plane as child of node
    plane.setParent(tNode);

    if (!this.isEditSpawnAreaMode) tNode.setEnabled(false);

    return tNode;
  }

  private _setGPUPickerPickList(
    meshList?: Array<Mesh | AbstractMesh>
  ): Array<Mesh | AbstractMesh> {
    const importedList = this.currentObjects
      .map((root) => root.getChildMeshes())
      .flat();
    const userImagesList = this.currentObjects.filter(
      (root) => root.metadata.type === "images"
    );
    const list = [...importedList, ...userImagesList];
    if (meshList) list.push(...meshList);
    this.gpuPicker?.setPickingList(list);
    return list;
  }

  setStudioPostData(postData: StudioSpaceProperty) {
    this.postData = postData;
  }

  async loadDraft(
    postData: StudioPost,
    skyboxLoadedCallback?: () => void,
    draftLoadedCallback?: () => void,
    onSceneReady?: () => void
  ) {
    const { previewCamera, atom, size } = postData.space;

    const previewCamPosition = Vector3.FromArray(previewCamera.position);
    const previewCamTarget = Vector3.FromArray(previewCamera.target);

    this.theme.settings.defaultFrontView = {
      fov: previewCamera.fov,
      position: previewCamPosition.asArray(),
      target: previewCamTarget.asArray(),
    };

    if (this.thumbnailCamera === null) {
      this.thumbnailCamera = this._createOtherCamera(
        "thumbnailCamera",
        previewCamera.fov,
        previewCamPosition,
        previewCamTarget
      );
    }

    this.camera.setPosition(previewCamPosition);
    this.camera.setTarget(previewCamTarget);

    const { theme, userSpawnInfo, models } = atom;

    this.theme.userSpawnInfo =
      !Object.hasOwn(userSpawnInfo, "corners") || !userSpawnInfo.corners
        ? ATOM_THEME_SETTINGS["custom"].userSpawnInfo
        : userSpawnInfo;

    this.scene.blockMaterialDirtyMechanism = true;

    this.userSpawnPlane?.dispose(false, true);

    // draw rectangular plane from vector3 points based on min max X and Z values
    this.userSpawnPlane = this._createUserSpawnPlane([
      Vector3.FromArray(this.theme.userSpawnInfo.corners[0]),
      Vector3.FromArray(this.theme.userSpawnInfo.corners[1]),
      Vector3.FromArray(this.theme.userSpawnInfo.corners[2]),
      Vector3.FromArray(this.theme.userSpawnInfo.corners[3]),
      Vector3.FromArray(this.theme.userSpawnInfo.corners[0]),
    ]);

    // add objects to scene
    const promises: Array<Promise<void>> = [];

    if (theme)
      promises.push(
        this.loadTheme(theme.id, isMobile() ? "low" : "high", size)
      );

    const {
      skybox,
      architectures,
      furnitures,
      decorations,
      entertainments,
      images,
      objects,
    } = models;

    // loading skybox in parallel with other assets
    // will sometimes cause 3D objects to become fully black
    // promises.push(this.changeHDRSkybox(skybox, true));

    await this.changeHDRSkybox(skybox, true);

    skyboxLoadedCallback?.();

    // if there are more than 1 instance of the object in the models list,
    // clone the objects instead of importing them again for better performance
    const allItems = [];

    if (architectures) allItems.push(...architectures);
    if (furnitures) allItems.push(...furnitures);
    if (decorations) allItems.push(...decorations);
    if (entertainments) allItems.push(...entertainments);
    if (images) allItems.push(...images);
    if (objects) allItems.push(...objects);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let repeatedObjects: Array<any> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uniqueObjects: Array<any> = [];
    const uniqueIds: Array<string> = [];

    allItems.forEach((item) => {
      if (uniqueIds.length > 0 && uniqueIds.includes(item.id)) {
        repeatedObjects.push(item);
      } else {
        uniqueObjects.push(item);
      }
    });

    const failedToLoadIds: Set<string> = new Set();

    // load unique id objects first
    promises.push(
      ...uniqueObjects.map(async (object) => {
        let studioObject: StudioObject | null = null;
        try {
          const asset = await this.engineCore.loadAsset(object.id);
          if (!asset) {
            failedToLoadIds.add(object.id);
            throw new Error(`Failed to load studio asset ${object.id}`);
          }
          studioObject = asset as StudioObject;
        } catch (e) {
          if (clientSettings.DEBUG) console.error("Failed to load asset:", e);
          failedToLoadIds.add(object.id);
        }

        if (!studioObject) return;

        // add to scene
        await this.addStudioObject(
          studioObject,
          isMobile() ? "low" : "high",
          true,
          object.position,
          object.rotation,
          studioObject.type === "images"
            ? [object.scale[0], object.scale[1], 1]
            : object.scale,
          object.image,
          object.hyperlink
        );

        // load repeated objects by cloning after original one is added
        // (much faster and lower memory usage)
        for (const object of repeatedObjects) {
          if (object.id !== studioObject.id) continue;
          this.addStudioObject(
            studioObject,
            isMobile() ? "low" : "high",
            true,
            object.position,
            object.rotation,
            studioObject.type === "images"
              ? [object.scale[0], object.scale[1], 1]
              : object.scale,
            object.image,
            object.hyperlink
          );
        }

        // remove from repeated objects
        repeatedObjects = repeatedObjects.filter(
          (item) => item.id !== studioObject.id
        );
      })
    );

    await Promise.all(promises);

    if (clientSettings.DEBUG) {
      if (failedToLoadIds.size > 0) {
        if (clientSettings.DEBUG)
          console.warn("Failed to load assets:", failedToLoadIds);
      }
    }

    this.scene.blockMaterialDirtyMechanism = false;

    this._onDraftLoadedObservers.notifyObservers();
    this._isDraftLoaded = true;
    draftLoadedCallback?.();

    this.scene.onReadyObservable.addOnce((scene) => {
      scene.render();
      this.gpuPicker?.pickAsync(0, 0);
      onSceneReady?.();
    });
    // this.renderScene();
  }

  async loadTheme(
    atomThemeId: string,
    quality: "high" | "low" = "high",
    size?: number
  ) {
    const asset = await this.engineCore.loadAsset(atomThemeId);

    if (!asset) {
      if (clientSettings.DEBUG)
        console.error("Failed to load theme asset", atomThemeId);
      return;
    }

    const studioObject = asset as StudioObject;

    const { id, path, title } = studioObject;

    this.theme.id = atomThemeId;
    this.theme.name = title as AtomTheme;
    this.theme.settings = ATOM_THEME_SETTINGS[title];

    let resource = await this.atomResources.getResource(
      `${id}_${quality}`,
      `${path}/model_${quality}.glb`,
      false
    );
    if (quality === "high" && !resource) {
      resource = await this.atomResources.getResource(
        `${id}_low`,
        `${path}/model_low.glb`,
        false
      );
    }

    if (!resource) return;

    let meshes: Array<AbstractMesh> = [];
    try {
      const container = await loadAssetContainerAsync(
        resource.url,
        this.scene,
        {
          pluginExtension: ".glb",
        }
      );
      container.addAllToScene();
      meshes = container.meshes;
    } catch (e) {
      if (clientSettings.DEBUG) console.error("Failed to load theme model:", e);
      return;
    }

    this.theme.atomRoot = meshes[0];
    this.theme.atomMeshes = meshes.slice(1);

    this.theme.atomRoot.rotationQuaternion = null;
    this.theme.atomRoot.rotation.set(0, 0, 0);
    this.theme.atomRoot.scaling = size
      ? new Vector3(-size, size, size)
      : new Vector3(-1, 1, 1);

    meshes.forEach((mesh) => {
      mesh.material?.freeze();
      mesh.isPickable = false;
      mesh.doNotSyncBoundingInfo = true;
      mesh.freezeWorldMatrix();
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.layerMask = (1 << 1) | (1 << 2) | (1 << 3); // visible on both layers 0 and 1
    });

    this.camera.setTarget(
      Vector3.FromArray(this.theme.settings.defaultFrontView.target)
    );
    this.camera.setPosition(
      Vector3.FromArray(this.theme.settings.defaultFrontView.position)
    );

    if (this.isPreviewMode) this.setPreviewMode(false);
  }

  /** Reset saved states */
  resetSavedStates() {
    this.savedStates = [];
    this.currentStateIndex = 0;

    this.onSaveStateObservable.notifyObservers({
      savedStates: this.savedStates,
      currentStateIndex: this.currentStateIndex,
    });

    // this.renderScene();
  }

  /** Reset to default state with blank scene */
  resetAll() {
    this._detachMeshFromGizmo();

    this.resetSavedStates();

    this.changeHDRSkybox(STUDIO_DEFAULT_SKYBOX, true);

    // remove previous atom
    this.scene.blockfreeActiveMeshesAndRenderingGroups = true;
    this.theme.physicsAggregates.forEach((aggregate) => {
      aggregate.dispose();
    });
    this.theme.physicsAggregates = [];
    this._addedObjectsPhysicsAggregates.forEach((aggregate) => {
      aggregate.dispose();
    });
    this._addedObjectsPhysicsAggregates = [];
    this.theme.atomMeshes = [];
    this.theme.atomRoot?.dispose(false, true);
    this.theme.atomRoot = null;
    this.currentObjects.forEach((mesh) => {
      mesh.dispose(false, true);
    });
    this.currentObjects = [];
    this.scene.blockfreeActiveMeshesAndRenderingGroups = false;
  }

  setCameraToFrontView() {
    if (!this.cameraFrontViewSettings) return;
    this.camera.fov = this.cameraFrontViewSettings.fov;
    this.camera.target.copyFrom(
      Vector3.FromArray(this.cameraFrontViewSettings.target)
    );
    this.camera.position.copyFrom(
      Vector3.FromArray(this.cameraFrontViewSettings.position)
    );
  }

  setCameraToTopView() {
    this.cameraFrontViewSettings = {
      fov: this.camera.fov,
      position: [
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
      ],
      target: [
        this.camera.target.x,
        this.camera.target.y,
        this.camera.target.z,
      ],
    };
    this.camera.fov = this.theme.settings.topView.fov;
    this.camera.target.copyFrom(
      Vector3.FromArray(this.theme.settings.topView.target)
    );
    this.camera.setPosition(
      Vector3.FromArray(this.theme.settings.topView.position)
    );
  }

  toggleObjectLock(
    mesh: AbstractMesh | Mesh,
    forceLock?: boolean,
    forceUnlock?: boolean
  ) {
    if (this.isEditSpawnAreaMode || mesh.metadata?.isError === true) return;

    if (forceLock === true) {
      // lock object
      mesh.getChildMeshes().forEach((child) => {
        child.doNotSyncBoundingInfo = true;
        child.freezeWorldMatrix();
      });
      this.lockedObjects.push(mesh.uniqueId);
    } else if (forceUnlock === true) {
      if (mesh.metadata?.isError === true) return;
      mesh.getChildMeshes().forEach((child) => {
        child.doNotSyncBoundingInfo = false;
        child.unfreezeWorldMatrix();
      });
      this.lockedObjects.splice(this.lockedObjects.indexOf(mesh.uniqueId), 1);
    } else if (forceLock === undefined && forceUnlock === undefined) {
      // if object is locked, unlock it
      if (this.lockedObjects.includes(mesh.uniqueId)) {
        if (mesh.metadata?.isError === true) return;
        mesh.getChildMeshes().forEach((child) => {
          child.doNotSyncBoundingInfo = false;
          child.unfreezeWorldMatrix();
        });
        this.lockedObjects.splice(this.lockedObjects.indexOf(mesh.uniqueId), 1);

        this.saveState("unlock", {
          mesh: mesh,
        });
      } else {
        // lock object
        mesh.getChildMeshes().forEach((child) => {
          child.doNotSyncBoundingInfo = true;
          child.freezeWorldMatrix();
        });
        this.lockedObjects.push(mesh.uniqueId);

        this.saveState("lock", {
          mesh: mesh,
        });
      }
    }

    this.onSetObjectLockObservable.notifyObservers([...this.lockedObjects]);

    this.handleObjectLockState(mesh);

    // this.renderScene();
  }

  toggleMultiObjectsLock(
    meshes: Array<AbstractMesh | Mesh>,
    forceLock?: boolean,
    forceUnlock?: boolean
  ) {
    if (this.isEditSpawnAreaMode) return;

    if (forceLock === true) {
      // lock object
      meshes.forEach((mesh) => {
        if (mesh.metadata?.isError === true) return;
        mesh.getChildMeshes().forEach((child) => {
          child.doNotSyncBoundingInfo = true;
          child.freezeWorldMatrix();
        });
        this.lockedObjects.push(mesh.uniqueId);
      });

      this.gizmoManager.positionGizmoEnabled = false;
      this.gizmoManager.rotationGizmoEnabled = false;
      this.gizmoManager.scaleGizmoEnabled = false;
    } else if (forceUnlock === true) {
      // unlock object
      meshes.forEach((mesh) => {
        if (mesh.metadata?.isError === true) return;
        mesh.getChildMeshes().forEach((child) => {
          child.doNotSyncBoundingInfo = false;
          child.unfreezeWorldMatrix();
        });
      });

      // remove from locked objects
      const uniqueIds = new Set(meshes.map((mesh) => mesh.uniqueId));
      this.lockedObjects = this.lockedObjects.filter(
        (id) => !uniqueIds.has(id)
      );

      this.setGizmoType(this.currentGizmoType);
    } else if (forceLock === undefined && forceUnlock === undefined) {
      // check if all meshes are locked
      const areAllLocked = meshes.every((mesh) =>
        this.lockedObjects.includes(mesh.uniqueId)
      );

      // if all are locked, unlock all, otherwise, lock all
      if (areAllLocked) {
        // unlock
        meshes.forEach((mesh) => {
          if (mesh.metadata?.isError === true) return;
          mesh.getChildMeshes().forEach((child) => {
            child.doNotSyncBoundingInfo = false;
            child.unfreezeWorldMatrix();
          });
        });

        // remove from locked objects
        const uniqueIds = meshes.map((mesh) => mesh.uniqueId);
        this.lockedObjects = this.lockedObjects.filter(
          (id) => !uniqueIds.includes(id)
        );

        this.setGizmoType(this.currentGizmoType);

        this.saveState("lock", {
          meshes,
        });
      } else {
        // lock
        meshes.forEach((mesh) => {
          // lock object
          mesh.getChildMeshes().forEach((child) => {
            child.doNotSyncBoundingInfo = true;
            child.freezeWorldMatrix();
          });
          this.lockedObjects.push(mesh.uniqueId);

          this.gizmoManager.positionGizmoEnabled = false;
          this.gizmoManager.rotationGizmoEnabled = false;
          this.gizmoManager.scaleGizmoEnabled = false;
        });

        this.saveState("lock", {
          meshes,
        });
      }
    }

    this.showObjectOutlineForGroup(meshes);
    this.onSetObjectLockObservable.notifyObservers([...this.lockedObjects]);
    // this.renderScene();
  }

  toggleLock(): void {
    if (!this.gizmoManager.attachedMesh) return;

    if (this.gizmoManager.attachedMesh === this.selectedMeshGroup) {
      this.toggleMultiObjectsLock(this.selectedMeshGroup.getChildren());
    } else {
      this.toggleObjectLock(this.gizmoManager.attachedMesh);
    }
  }

  private handleObjectLockState(mesh: AbstractMesh | Mesh): void {
    if (this.lockedObjects.includes(mesh.uniqueId)) {
      this.gizmoManager.positionGizmoEnabled = false;
      this.gizmoManager.rotationGizmoEnabled = false;
      this.gizmoManager.scaleGizmoEnabled = false;

      // show orange outline for object
      this.showObjectOutline(mesh, AdlerStudioEngine.SELECT_LOCKED_COLOR);
    } else {
      this.setGizmoType(this.currentGizmoType);

      // show green outline for object
      this.showObjectOutline(mesh, AdlerStudioEngine.SELECT_UNLOCKED_COLOR);
    }
  }

  setGizmoType(type: GizmoTransformationType): void {
    this.currentGizmoType = type;

    if (
      this.gizmoManager.attachedMesh &&
      this.lockedObjects.includes(this.gizmoManager.attachedMesh.uniqueId)
    ) {
      this.gizmoManager.positionGizmoEnabled = false;
      this.gizmoManager.rotationGizmoEnabled = false;
      this.gizmoManager.scaleGizmoEnabled = false;
      return;
    }

    const areAllLocked = this.selectedMeshGroup
      .getChildren()
      .every((mesh) => this.lockedObjects.includes(mesh.uniqueId));
    if (
      this.gizmoManager.attachedMesh === this.selectedMeshGroup &&
      areAllLocked
    ) {
      this.gizmoManager.positionGizmoEnabled = false;
      this.gizmoManager.rotationGizmoEnabled = false;
      this.gizmoManager.scaleGizmoEnabled = false;
      return;
    }

    this.gizmoManager.positionGizmoEnabled = type === "location";
    this.gizmoManager.rotationGizmoEnabled = type === "rotation";
    this.gizmoManager.scaleGizmoEnabled = type === "scale";

    if (
      this.gizmoManager.attachedMesh?.metadata &&
      Object.hasOwn(this.gizmoManager.attachedMesh?.metadata, "type") &&
      this.gizmoManager.attachedMesh?.metadata.type === "images"
    ) {
      this.gizmoManager.scaleGizmoEnabled = false;
      this.gizmoManager.boundingBoxGizmoEnabled = type === "scale";
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

      if (this.gizmoManager.attachedMesh === this.selectedMeshGroup) return;

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
          this.storedMeshTransforms ||
          Object.keys(this.storedMultiMeshTransforms).length > 0
        ) {
          this.saveTransformState("move");
        }
      });

      const observer = (event: AxisGizmoDragEvent) => {
        if (!this.gizmoManager.attachedMesh) return;

        const delta = event.delta.clone();
        if (this._keyDown.shift) {
          delta.scaleInPlace(AdlerStudioEngine.DRAG_SENSITIVITY_LOW);
        }
        this.gizmoManager.attachedMesh.position.addInPlace(delta.clone());

        this.updateObjectTransform2D(this.gizmoManager.attachedMesh);
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
          this.storedMeshTransforms ||
          Object.keys(this.storedMultiMeshTransforms).length > 0
        ) {
          this.saveTransformState("rotate");
        }
      });
      rotationGizmo.onDragObservable.add(() => {
        if (this._keyDown.shift) {
          rotationGizmo.snapDistance = Math.PI / 180;
          rotationGizmo.sensitivity = AdlerStudioEngine.DRAG_SENSITIVITY_LOW;
        } else if (this._keyDown.control || this._keyDown.meta) {
          // increment rotation every 5 degrees
          rotationGizmo.snapDistance = Math.PI / 36;
        } else {
          rotationGizmo.snapDistance = Math.PI / 180;
          rotationGizmo.sensitivity = AdlerStudioEngine.DRAG_SENSITIVITY_NORMAL;
        }

        if (this.gizmoManager.attachedMesh) {
          this.updateObjectTransform2D(this.gizmoManager.attachedMesh);
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
          this.storedMeshTransforms ||
          Object.keys(this.storedMultiMeshTransforms).length > 0
        ) {
          this.saveTransformState("scale");
        }
      });

      // switch gizmo axis based on object type
      if (this.gizmoManager.attachedMesh) {
        this.updateObjectTransform2D(this.gizmoManager.attachedMesh);

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

        //   this.updateObjectTransform2D(mesh);
        // }

        scaleGizmo.sensitivity = this._keyDown.shift
          ? AdlerStudioEngine.DRAG_SENSITIVITY_LOW
          : AdlerStudioEngine.DRAG_SENSITIVITY_NORMAL;

        if (this.gizmoManager.attachedMesh) {
          this.updateObjectTransform2D(this.gizmoManager.attachedMesh);
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
          this.storedMeshTransforms ||
          Object.keys(this.storedMultiMeshTransforms).length > 0
        ) {
          this.saveTransformState("scale");
        }
      });
      bbGizmo.onScaleBoxDragObservable.add(() => {
        if (this.gizmoManager.attachedMesh) {
          this.updateObjectTransform2D(this.gizmoManager.attachedMesh);
        }
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _updateGizmoAxis(
    type: StudioObjectType,
    _subType: StudioObjectSubType
  ) {
    if (this._gizmoDragSceneRenderObservable !== null) {
      this._gizmoDragSceneRenderObservable.remove();
      this._gizmoDragSceneRenderObservable = null;
    }

    // use bounding box gizmo for images type
    if (this.gizmoManager.scaleGizmoEnabled === true) {
      if (type === "images") {
        this.gizmoManager.scaleGizmoEnabled = false;
        this.gizmoManager.boundingBoxGizmoEnabled = true;

        // disable bounding box gizmo object relocation
        this.gizmoManager.boundingBoxDragBehavior.detach();
        // disable bounding box gizmo rotation
        if (this.gizmoManager.gizmos.boundingBoxGizmo) {
          this.gizmoManager.gizmos.boundingBoxGizmo.setEnabledRotationAxis("");
          this.gizmoManager.gizmos.boundingBoxGizmo.rotationSphereSize = 0;
        }
      }
    } else if (
      this.gizmoManager.boundingBoxGizmoEnabled === true &&
      type !== "images"
    ) {
      this.gizmoManager.scaleGizmoEnabled = true;
      this.gizmoManager.boundingBoxGizmoEnabled = false;
    }

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

    //       if (parent && this.currentObjects.includes(parent as Mesh)) {
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

    if (this.gizmoManager.attachedMesh?.metadata.isUserSpawnPlane === true) {
      this._gizmoDragSceneRenderObservable =
        this.scene.onBeforeRenderObservable.add(() => {
          if (
            this.gizmoManager.gizmos.positionGizmo?.isDragging !== true &&
            this.gizmoManager.gizmos.rotationGizmo?.isDragging !== true &&
            this.gizmoManager.gizmos.scaleGizmo?.isDragging !== true
          )
            return;

          if (!this.gizmoManager.attachedMesh) return;

          const mesh = this.gizmoManager.attachedMesh;

          // extra 4 corners from spawn plane
          const spawnPlane = this.userSpawnPlane?.getChildren()[0] as Mesh;
          const positions = spawnPlane.getVerticesData(
            VertexBuffer.PositionKind
          );
          const fourCorners = [];

          if (positions) {
            for (let i = 0; i < positions.length; i += 3) {
              const vector = new Vector3(
                positions[i],
                positions[i + 1],
                positions[i + 2]
              );
              const worldVector = Vector3.TransformCoordinates(
                vector,
                spawnPlane.getWorldMatrix()
              );
              fourCorners.push(worldVector);
            }
          }

          this.theme.userSpawnInfo.corners = [
            fourCorners[0].asArray(),
            fourCorners[1].asArray(),
            fourCorners[2].asArray(),
            fourCorners[3].asArray(),
          ];

          this.theme.userSpawnInfo.target = mesh.forward.asArray();
        });
    }
  }

  private _cancelGizmoDragging() {
    const handleResetTransform = () => {
      const attachedMesh = this.gizmoManager.attachedMesh;
      if (!attachedMesh) return;

      if (attachedMesh === this.selectedMeshGroup) {
        if (Object.keys(this.storedMultiMeshTransforms).length > 0) {
          const children = attachedMesh.getChildren();
          (children as Array<AbstractMesh>).forEach((child) => {
            const childId = child.uniqueId;
            if (this.storedMultiMeshTransforms[childId]) {
              child.setAbsolutePosition(
                Vector3.FromArray(
                  this.storedMultiMeshTransforms[childId].absolutePosition
                )
              );
              child.rotation = Quaternion.FromArray(
                this.storedMultiMeshTransforms[childId]
                  .absoluteRotationQuaternion
              ).toEulerAngles();
              child.scaling.copyFrom(
                Vector3.FromArray(
                  this.storedMultiMeshTransforms[childId].absoluteScaling
                )
              );
            }
          });
        }
      } else {
        if (this.storedMeshTransforms) {
          attachedMesh.position.copyFrom(
            Vector3.FromArray(this.storedMeshTransforms.absolutePosition)
          );
          attachedMesh.rotation.copyFrom(
            Quaternion.FromArray(
              this.storedMeshTransforms.absoluteRotationQuaternion
            ).toEulerAngles()
          );
          attachedMesh.scaling.copyFrom(
            Vector3.FromArray(this.storedMeshTransforms.absoluteScaling)
          );
        }
      }
    };

    switch (true) {
      case this.gizmoManager.gizmos.positionGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.positionGizmo?.attachedMesh: {
          this._dragCancelled = true;
          this.gizmoManager.gizmos.positionGizmo.releaseDrag();
          handleResetTransform();
          break;
        }
      case this.gizmoManager.gizmos.rotationGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.rotationGizmo?.attachedMesh: {
          this._dragCancelled = true;
          this.gizmoManager.gizmos.rotationGizmo.releaseDrag();
          handleResetTransform();
          break;
        }
      case this.gizmoManager.gizmos.scaleGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.scaleGizmo?.attachedMesh: {
          this.gizmoManager.gizmos.scaleGizmo.releaseDrag();
          handleResetTransform();
          break;
        }
      case this.gizmoManager.gizmos.boundingBoxGizmo?.isDragging === true &&
        !!this.gizmoManager.gizmos.boundingBoxGizmo?.attachedMesh: {
          this._dragCancelled = true;
          this.gizmoManager.gizmos.boundingBoxGizmo.releaseDrag();
          handleResetTransform();
          break;
        }
    }

    // this.renderScene();
  }

  private _detachMeshFromGizmo() {
    if (!this.gizmoManager.attachedMesh) return;

    if (this.gizmoManager.attachedMesh === this.selectedMeshGroup) {
      const children = this.gizmoManager.attachedMesh.getChildren();
      children.forEach((child) => {
        (child as AbstractMesh).setParent(null);
      });
    }

    this.gizmoManager.attachToMesh(null);
  }

  private _attachGizmoToGroupNode() {
    // position group node at the center of all children
    const center = Vector3.Zero();
    const childMeshes = this.selectedMeshGroup.getChildMeshes();
    const directChildren = this.selectedMeshGroup.getChildren();

    // calculate center of all children meshes
    childMeshes.forEach((child) => {
      center.addInPlace(child.getAbsolutePosition());
    });
    center.scaleInPlace(1 / childMeshes.length);

    // remove children from group node, re-position node, then set children again
    directChildren.forEach((child) => (child as AbstractMesh).setParent(null));
    this.selectedMeshGroup.setAbsolutePosition(center);
    directChildren.forEach((clone) =>
      (clone as AbstractMesh).setParent(this.selectedMeshGroup)
    );

    // attach gizmo to group node
    this.gizmoManager.attachToMesh(this.selectedMeshGroup as AbstractMesh);
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
    if (this.gizmoManager.attachedMesh === this.selectedMeshGroup) {
      this.storedMultiMeshTransforms = {};
      const children = this.selectedMeshGroup.getChildren();
      (children as Array<AbstractMesh>).forEach((child) => {
        this.storedMultiMeshTransforms[child.uniqueId] = {
          absolutePosition: child.absolutePosition.asArray(),
          absoluteRotationQuaternion:
            child.absoluteRotationQuaternion.asArray(),
          absoluteScaling: child.absoluteScaling.asArray(),
        };
      });
    } else {
      const attachedMesh = this.gizmoManager.attachedMesh;

      this.storedMeshTransforms = {
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

    if (attachedMesh === this.selectedMeshGroup) {
      if (Object.keys(this.storedMultiMeshTransforms).length === 0) return;

      const children = attachedMesh.getChildren();
      const newTransforms: Record<string, ObjectAbsoluteTransforms> = {};

      let amountOfUnchangedTransforms: number = 0;

      (children as Array<AbstractMesh>).forEach((mesh) => {
        const oldMeshTransforms = this.storedMultiMeshTransforms[mesh.uniqueId];

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
      });

      if (amountOfUnchangedTransforms === children.length) {
        if (clientSettings.DEBUG) {
          console.log(
            "No transform changes in group transforms, not saving state"
          );
        }
        return;
      }

      this.saveState(state, {
        meshes: children,
        old: this.storedMultiMeshTransforms,
        new: newTransforms,
      });

      if (clientSettings.DEBUG) {
        console.log(
          "Saved transform state for group",
          this.savedStates[this.currentStateIndex - 1]
        );
      }
    } else {
      if (!this.storedMeshTransforms) return;

      const newTransforms: ObjectAbsoluteTransforms = {
        absolutePosition: attachedMesh.absolutePosition.asArray(),
        absoluteRotationQuaternion:
          attachedMesh.absoluteRotationQuaternion?.asArray(),
        absoluteScaling: attachedMesh.absoluteScaling.asArray(),
      };

      // if transforms aren't changed, don't save state
      if (
        areArraysEqual(
          this.storedMeshTransforms.absolutePosition,
          newTransforms.absolutePosition
        ) &&
        areArraysEqual(
          this.storedMeshTransforms.absoluteRotationQuaternion,
          newTransforms.absoluteRotationQuaternion
        ) &&
        areArraysEqual(
          this.storedMeshTransforms.absoluteScaling,
          newTransforms.absoluteScaling
        )
      ) {
        return;
      }

      this.saveState(state, {
        mesh: attachedMesh,
        old: this.storedMeshTransforms,
        new: newTransforms,
      });
    }
  }

  private showObjectOutline(
    mesh: Nullable<AbstractMesh | Mesh | Node>,
    color: Color3 = AdlerStudioEngine.SELECT_UNLOCKED_COLOR
  ): void {
    if (!mesh) return;

    const children = mesh.getChildMeshes();
    if (children.length > 0) {
      for (const child of children) {
        if (child.getClassName() === "Mesh") {
          this.highlightLayer.removeExcludedMesh(child as Mesh);
          this.highlightLayer.addMesh(child as Mesh, color);
        }
      }
    } else {
      this.highlightLayer.removeExcludedMesh(mesh as Mesh);
      this.highlightLayer.addMesh(mesh as Mesh, color);
    }

    // add all other objects to excluded list to prevent being
    // highlighted when object is in front of another bigger object
    this.currentObjects.forEach((obj) => {
      if (obj !== mesh) {
        const children = obj.getChildMeshes();
        if (children.length > 0) {
          children.forEach((child) => {
            if (child.getClassName() === "Mesh") {
              this.highlightLayer.addExcludedMesh(child as Mesh);
            }
          });
        } else {
          this.highlightLayer.addExcludedMesh(obj as Mesh);
        }
      }
    });
  }

  private showObjectOutlineForGroup(
    meshes: Array<AbstractMesh | Mesh | Node>
  ): void {
    meshes.forEach((mesh) => {
      const children = mesh.getChildMeshes();
      if (children.length > 0) {
        children.forEach((child) => {
          this.highlightLayer.removeExcludedMesh(child as Mesh);
          if (this.lockedObjects.includes(mesh.uniqueId)) {
            this.highlightLayer.addMesh(
              child as Mesh,
              AdlerStudioEngine.SELECT_LOCKED_COLOR
            );
          } else {
            this.highlightLayer.addMesh(
              child as Mesh,
              AdlerStudioEngine.SELECT_UNLOCKED_COLOR
            );
          }
        });
      } else {
        this.highlightLayer.removeExcludedMesh(mesh as Mesh);
        if (this.lockedObjects.includes(mesh.uniqueId)) {
          this.highlightLayer.addMesh(
            mesh as Mesh,
            AdlerStudioEngine.SELECT_LOCKED_COLOR
          );
        } else {
          this.highlightLayer.addMesh(
            mesh as Mesh,
            AdlerStudioEngine.SELECT_UNLOCKED_COLOR
          );
        }
      }
    });

    // add all other objects to excluded list to prevent being
    // highlighted when object is in front of another bigger object
    this.currentObjects
      .filter((obj) => !meshes.includes(obj))
      .forEach((obj) => {
        const children = obj.getChildMeshes();
        if (children.length > 0) {
          children.forEach((child) => {
            this.highlightLayer.addExcludedMesh(child as Mesh);
          });
        } else {
          this.highlightLayer.addExcludedMesh(obj as Mesh);
        }
      });
  }

  private hideGroupObjectOutline(
    meshes: Array<AbstractMesh | Mesh | Node>
  ): void {
    meshes.forEach((mesh) => {
      const children = mesh.getChildMeshes();
      if (children.length > 0) {
        children.forEach((child) => {
          this.highlightLayer.removeMesh(child as Mesh);
        });
      } else {
        this.highlightLayer.removeMesh(mesh as Mesh);
      }
    });
  }

  private hideObjectOutline(mesh: Nullable<AbstractMesh | Mesh>): void {
    if (!mesh) return;

    const children = mesh.getChildMeshes();
    if (children.length > 0) {
      children.forEach((child) => {
        this.highlightLayer.removeMesh(child as Mesh);
      });
    } else {
      this.highlightLayer.removeMesh(mesh as Mesh);
    }
  }

  private _detachGizmoFromMesh(mesh: AbstractMesh | Mesh) {
    this.hideObjectOutline(mesh);
    this._detachMeshFromGizmo();
  }

  unselectAllObjects(saveState: boolean = false) {
    if (!this.gizmoManager.attachedMesh) return;

    const attachedMesh = this.gizmoManager.attachedMesh;

    if (attachedMesh === this.selectedMeshGroup) {
      const children = [...this.selectedMeshGroup.getChildren()];
      if (saveState) {
        this.saveState("deselect", {
          meshes: children,
        });
      }
      this.setSelectedGroupObjects([]);
      this._detachMeshFromGizmo();
      this.hideGroupObjectOutline(children);
    } else {
      this._detachGizmoFromMesh(attachedMesh);
      if (saveState) {
        this.saveState("deselect", {
          mesh: attachedMesh,
        });
      }
    }

    this.highlightLayer.removeAllMeshes();
  }

  setSelectedGroupObjects(meshes: Array<AbstractMesh | Mesh | Node>) {
    this.selectedMeshGroup.getChildren().forEach((child) => {
      (child as AbstractMesh).setParent(null);
    });

    // reset transforms for group node
    this.selectedMeshGroup.setAbsolutePosition(Vector3.Zero());
    this.selectedMeshGroup.rotationQuaternion = null;
    this.selectedMeshGroup.rotation = Vector3.Zero();
    this.selectedMeshGroup.scaling = Vector3.One();

    if (meshes.length === 0) return;

    meshes.forEach((mesh) => {
      (mesh as AbstractMesh).setParent(this.selectedMeshGroup);
    });
  }

  updateObjectTransform2D(mesh: AbstractMesh | Mesh) {
    this.onSetObjectTransformObservable.notifyObservers({
      location: mesh.position.asArray(),
      rotation: mesh.rotation.asArray(),
      scale: mesh.scaling.asArray(),
    });
    // this.renderScene();
  }

  undo() {
    const lastStep = this.currentStateIndex - 1;

    if (lastStep < 0 || lastStep >= this.savedStates.length) return;

    const step = this.savedStates[lastStep];

    if (clientSettings.DEBUG) console.log("undo:", step);

    // revert changes based on step type
    switch (step.type) {
      case "select": {
        if (step.data.mesh) {
          this._detachGizmoFromMesh(step.data.mesh);
        } else if (step.data.meshes) {
          this.unselectAllObjects();
          this.setSelectedGroupObjects(step.data.meshes);
          this.showObjectOutlineForGroup(this.selectedMeshGroup.getChildren());
          this._attachGizmoToGroupNode();
        }

        // check the previous step to this and if it's 'select' type, select the mesh
        const lastLastStep = lastStep - 1;
        if (lastLastStep >= 0 && lastLastStep < this.savedStates.length) {
          const stepPrior = this.savedStates[lastStep - 1];
          if (stepPrior.type === "select") {
            if (stepPrior.data.mesh) {
              this.unselectAllObjects();
              this.gizmoManager.attachToMesh(stepPrior.data.mesh);
            } else if (stepPrior.data.meshes) {
              this.unselectAllObjects();
              this.setSelectedGroupObjects(stepPrior.data.meshes);
              this.showObjectOutlineForGroup(
                this.selectedMeshGroup.getChildren()
              );
              this._attachGizmoToGroupNode();
            }
          }
        }
        break;
      }
      case "deselect": {
        if (step.data.mesh) {
          this.unselectAllObjects();
          this.gizmoManager.attachToMesh(step.data.mesh);
        } else if (step.data.meshes) {
          this.unselectAllObjects();
          this.setSelectedGroupObjects(step.data.meshes);
          this.showObjectOutlineForGroup(this.selectedMeshGroup.getChildren());
          this._attachGizmoToGroupNode();
        }
        break;
      }
      case "add": {
        if (step.data.mesh) {
          this.hideObjectOutline(step.data.mesh);
          this.removeFromScene(step.data.mesh);
          this.currentObjects.splice(
            this.currentObjects.indexOf(step.data.mesh),
            1
          );
          this._setGPUPickerPickList();
          this._detachMeshFromGizmo();
        }
        break;
      }
      case "delete": {
        if (step.data.mesh) {
          this._addMeshToScene(step.data.mesh);
          this.currentObjects.push(step.data.mesh);
          this._setGPUPickerPickList();
          this.unselectAllObjects();
          this.gizmoManager.attachToMesh(step.data.mesh);
        } else if (step.data.meshes) {
          (step.data.meshes as Array<AbstractMesh>).forEach((mesh) => {
            this._addMeshToScene(mesh);
            this.currentObjects.push(mesh);
            mesh.setParent(this.selectedMeshGroup);
          });
          this._setGPUPickerPickList();
          this.unselectAllObjects();
          this._attachGizmoToGroupNode();
        }
        break;
      }
      case "move":
      case "rotate":
      case "scale": {
        if (!step.data.old) break;
        if (step.data.mesh) {
          const mesh = step.data.mesh;
          mesh.setAbsolutePosition(
            Vector3.FromArray(step.data.old.absolutePosition)
          );
          mesh.rotation = Quaternion.FromArray(
            step.data.old.absoluteRotationQuaternion
          ).toEulerAngles();
          mesh.scaling.copyFrom(
            Vector3.FromArray(step.data.old.absoluteScaling)
          );

          this.updateObjectTransform2D(mesh);
          this.gizmoManager.attachToMesh(mesh);
        } else if (step.data.meshes) {
          (step.data.meshes as Array<AbstractMesh>).forEach((mesh) => {
            mesh.setAbsolutePosition(
              Vector3.FromArray(step.data.old[mesh.uniqueId].absolutePosition)
            );
            mesh.rotation = Quaternion.FromArray(
              step.data.old[mesh.uniqueId].absoluteRotationQuaternion
            ).toEulerAngles();
            mesh.scaling.copyFrom(
              Vector3.FromArray(step.data.old[mesh.uniqueId].absoluteScaling)
            );
          });
          this.setSelectedGroupObjects(step.data.meshes);
          this.showObjectOutlineForGroup(this.selectedMeshGroup.getChildren());
          this._attachGizmoToGroupNode();
        }
        break;
      }
      case "lock": {
        if (step.data.mesh) this.toggleObjectLock(step.data.mesh, false, true);
        else if (step.data.meshes)
          this.toggleMultiObjectsLock(step.data.meshes, false, true);
        break;
      }
      case "unlock": {
        if (step.data.mesh) this.toggleObjectLock(step.data.mesh, true, false);
        else if (step.data.meshes)
          this.toggleMultiObjectsLock(step.data.meshes, true, false);
        break;
      }
      case "duplicate": {
        if (step.data.mesh) {
          if (step.data.mesh === this.userSpawnPlane) break;
          this.hideObjectOutline(step.data.mesh);
          this.removeFromScene(step.data.mesh);
          this.currentObjects.splice(
            this.currentObjects.indexOf(step.data.mesh),
            1
          );
          this.gizmoManager.attachToMesh(step.data.priorSelectedMesh);
        } else if (step.data.meshes) {
          (step.data.meshes as Array<AbstractMesh>).forEach((child) => {
            this.removeFromScene(child);
            this.currentObjects.splice(this.currentObjects.indexOf(child), 1);
          });
          (step.data.priorSelectedMeshes as Array<AbstractMesh>).forEach(
            (mesh) => {
              mesh.setParent(this.selectedMeshGroup);
            }
          );
          this._attachGizmoToGroupNode();
        }
        this._setGPUPickerPickList();
        break;
      }
      case "changeSkybox": {
        this.changeHDRSkybox(step.data.old, true);
        break;
      }
    }

    this.currentStateIndex--;

    // this.renderScene();
  }

  redo() {
    if (
      this.currentStateIndex < 0 ||
      this.currentStateIndex >= this.savedStates.length
    )
      return;

    const step = this.savedStates[this.currentStateIndex];

    if (clientSettings.DEBUG) console.log("redo:", step);

    // revert changes based on step type
    switch (step.type) {
      case "select": {
        if (step.data.mesh) {
          this.unselectAllObjects();
          this.gizmoManager.attachToMesh(step.data.mesh);
        } else if (step.data.meshes) {
          this.unselectAllObjects();
          this.setSelectedGroupObjects(step.data.meshes);
          this.showObjectOutlineForGroup(this.selectedMeshGroup.getChildren());
          this._attachGizmoToGroupNode();
        }
        break;
      }
      case "deselect": {
        if (step.data.mesh) {
          this._detachGizmoFromMesh(step.data.mesh);
        } else if (step.data.meshes) {
          this.unselectAllObjects();
        }
        break;
      }
      case "add": {
        if (step.data.mesh) {
          this._addMeshToScene(step.data.mesh);
          this.currentObjects.push(step.data.mesh);
          this._setGPUPickerPickList();
          this.unselectAllObjects();
          this.gizmoManager.attachToMesh(step.data.mesh);
        }
        break;
      }
      case "delete": {
        if (step.data.mesh) {
          this.hideObjectOutline(step.data.mesh);
          this.removeFromScene(step.data.mesh);
          this.currentObjects.splice(
            this.currentObjects.indexOf(step.data.mesh),
            1
          );
          this._setGPUPickerPickList();
          this._detachMeshFromGizmo();
        } else if (step.data.meshes) {
          (step.data.meshes as Array<AbstractMesh>).forEach((child) => {
            this.removeFromScene(child);
            this.currentObjects.splice(this.currentObjects.indexOf(child), 1);
          });
          this._setGPUPickerPickList();
          this._detachMeshFromGizmo();
        }
        break;
      }
      case "move":
      case "rotate":
      case "scale": {
        if (!step.data.new) break;
        if (step.data.mesh) {
          const mesh = step.data.mesh;
          mesh.setAbsolutePosition(
            Vector3.FromArray(step.data.new.absolutePosition)
          );
          mesh.rotation = Quaternion.FromArray(
            step.data.new.absoluteRotationQuaternion
          ).toEulerAngles();
          mesh.scaling.copyFrom(
            Vector3.FromArray(step.data.new.absoluteScaling)
          );
          this.updateObjectTransform2D(mesh);
        } else if (step.data.meshes) {
          (step.data.meshes as Array<AbstractMesh>).forEach((child) => {
            child.setAbsolutePosition(
              Vector3.FromArray(step.data.new[child.uniqueId].absolutePosition)
            );
            child.rotation = Quaternion.FromArray(
              step.data.new[child.uniqueId].absoluteRotationQuaternion
            ).toEulerAngles();
            child.scaling.copyFrom(
              Vector3.FromArray(step.data.new[child.uniqueId].absoluteScaling)
            );
          });
          this._attachGizmoToGroupNode();
        }
        break;
      }
      case "lock": {
        if (step.data.mesh) this.toggleObjectLock(step.data.mesh, true, false);
        else if (step.data.meshes)
          this.toggleMultiObjectsLock(step.data.meshes, true, false);
        break;
      }
      case "unlock": {
        if (step.data.mesh) this.toggleObjectLock(step.data.mesh, false, true);
        else if (step.data.meshes)
          this.toggleMultiObjectsLock(step.data.meshes, false, true);
        break;
      }
      case "duplicate": {
        if (step.data.mesh) {
          if (step.data.mesh === this.userSpawnPlane) break;
          if (this.gizmoManager.attachedMesh) {
            this.hideObjectOutline(step.data.priorSelectedMesh);
          }
          this._addMeshToScene(step.data.mesh);
          this.currentObjects.push(step.data.mesh);
          this.unselectAllObjects();
          this.gizmoManager.attachToMesh(step.data.mesh);
        } else if (step.data.meshes) {
          (step.data.priorSelectedMeshes as Array<AbstractMesh>).forEach(
            (mesh) => {
              mesh.setParent(null);
            }
          );
          (step.data.meshes as Array<AbstractMesh>).forEach((child) => {
            this._addMeshToScene(child);
            this.currentObjects.push(child);
            child.setParent(this.selectedMeshGroup);
          });
          this._setGPUPickerPickList();
          this.unselectAllObjects();
          this._attachGizmoToGroupNode();
        }
        this._setGPUPickerPickList();
        break;
      }
      case "changeSkybox": {
        this.changeHDRSkybox(step.data.new, true);
        break;
      }
    }

    this.currentStateIndex++;

    // this.renderScene();
  }

  deleteObjects() {
    if (!this.gizmoManager.attachedMesh) return;

    if (this.gizmoManager.attachedMesh === this.selectedMeshGroup) {
      const children = this.gizmoManager.attachedMesh.getChildren();
      children.forEach((child) => {
        this.removeFromScene(child as AbstractMesh);
        this.currentObjects.splice(
          this.currentObjects.indexOf(child as AbstractMesh),
          1
        );
      });
      this._setGPUPickerPickList();
      this._detachMeshFromGizmo();
      this.saveState("delete", {
        meshes: children,
      });
    } else {
      const meshToRemove = this.gizmoManager.attachedMesh;
      this.removeFromScene(meshToRemove);
      this.currentObjects.splice(this.currentObjects.indexOf(meshToRemove), 1);
      this._setGPUPickerPickList();
      this._detachMeshFromGizmo();

      this.saveState("delete", {
        mesh: meshToRemove,
      });
    }
  }

  private _addMeshToScene(object: AbstractMesh | Mesh | TransformNode) {
    object.setEnabled(true);
    object.getChildMeshes().forEach((child) => child.setEnabled(true));
  }

  removeFromScene(object: AbstractMesh | Mesh | TransformNode): void {
    object.setEnabled(false);
    object.getChildMeshes().forEach((child) => child.setEnabled(false));
  }

  async addStudioObject(
    object: StudioObject,
    quality: "high" | "low" = "high",
    doNotSaveState: boolean = false,
    position?: ObjectTransform,
    rotation?: ObjectTransform,
    scale?: ObjectTransform,
    imageName?: string,
    hyperlink?: HyperLinkData,
    noClone: boolean = false
  ) {
    const { id, path, type, title, subType } = object;

    if (doNotSaveState === false && clientSettings.DEBUG) {
      if (clientSettings.DEBUG) console.log("Adding object:", object);
    }

    const existingObject = this.currentObjects.find(
      (root) => root.metadata.id === id
    );

    let root;
    // if object already exists in the scene, clone it instead of importing again,
    // don't clone picture frames
    if (existingObject && subType !== "picture_frame" && !noClone) {
      const newObject = existingObject.clone(
        id + "_" + this.currentObjects.length,
        null,
        false
      )!;
      if (position) {
        newObject.position = Vector3.FromArray(position);
      } else {
        if (subType === "ceiling") {
          const bb = newObject.getHierarchyBoundingVectors();
          newObject.position.set(0, Math.abs(bb.max.y - bb.min.y), 0);
        } else {
          newObject.position.setAll(0);
        }
      }
      newObject.rotation = rotation
        ? Vector3.FromArray(rotation)
        : Vector3.Zero();
      newObject.scaling = scale ? Vector3.FromArray(scale) : Vector3.One();

      // fix image aspect ratio
      if (type === "images") {
        if (
          newObject.material &&
          newObject.material instanceof PBRMaterial &&
          newObject.material.albedoTexture
        ) {
          const texture = newObject.material.albedoTexture as Texture;
          const sizes = texture.getSize();
          const aspectRatio = sizes.width / sizes.height;
          newObject.scaling.x = aspectRatio * newObject.scaling.y;
        }
      }

      root = newObject;

      if (imageName)
        this.setImageForAddedStudioObject(
          root,
          root.getChildren()[0] as AbstractMesh,
          imageName,
          true
        );
    } else {
      let resource: Resource | undefined;
      try {
        resource = await this.atomResources.getResource(
          `${id}_${quality}`,
          `${path}/model_${quality}.glb`,
          false
        );
      } catch (e) {
        // empty
      }

      if (!resource) {
        try {
          resource = await this.atomResources.getResource(
            `${id}_low`,
            `${path}/model_low.glb`,
            false
          );
        } catch (e) {
          // empty
        }
      }

      if (!resource) {
        this.loadErrorModel(object, position, rotation, quality);
        return;
      }

      if (type === "images") {
        try {
          root = await this.loadStudioImageObject(
            object,
            quality,
            position,
            rotation,
            scale,
            hyperlink,
            doNotSaveState
          );
        } catch (e) {
          if (clientSettings.DEBUG)
            console.error("Error importing image object:", e);
          this.loadErrorModel(object, position, rotation, quality);
        }
      } else {
        const rootNode = new TransformNode(id + "_rootNode", this.scene);

        try {
          const container = await loadAssetContainerAsync(
            resource.url,
            this.scene,
            {
              pluginExtension: ".glb",
            }
          );
          container.addAllToScene();

          root = rootNode;

          container.meshes[0].parent = rootNode;
          container.meshes.slice(1).forEach((mesh) => {
            mesh.isPickable = true; // for drag-n-drop ray picking
            mesh.material?.freeze();
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.layerMask = (1 << 1) | (1 << 2) | (1 << 3); // visible on both layers 0 and 1
            mesh.renderingGroupId = 1;
          });

          const subTypeToUse = subType ?? "none";

          // update root mesh metadata to let application know
          // what object type it is to update correct gizmo axis
          root.metadata = {
            id,
            name: title,
            type,
            subType: subTypeToUse,
            type3D: STUDIO_OBJECT_TYPE_DICTIONARY[subTypeToUse] ?? "ground",
            hyperlink,
          } as StudioMeshMetaData;

          if (hyperlink) {
            this.loadHyperLinkAnchor(rootNode, false);
            if (
              hyperlink &&
              hyperlink.useAsPortal &&
              hyperlink.link.startsWith("/")
            ) {
              let domain = clientSettings.DOMAIN;
              if (domain.startsWith("http://localhost:")) {
                domain = "https://adler-dev3.vercel.app";
              }
              hyperlink.link = domain + hyperlink.link;
            }
          }

          if (position) {
            root.position = Vector3.FromArray(position);
          } else {
            if (subType === "ceiling") {
              const bb = root.getHierarchyBoundingVectors();
              root.position.set(0, Math.abs(bb.max.y - bb.min.y), 0);
            } else {
              root.position.setAll(0);
            }
          }
          root.rotationQuaternion = null;
          root.rotation = rotation
            ? Vector3.FromArray(rotation)
            : Vector3.Zero();
          root.scaling = scale ? Vector3.FromArray(scale) : Vector3.One();

          if (imageName)
            this.setImageForAddedStudioObject(
              root,
              container.meshes[0],
              imageName
            );
        } catch (e) {
          if (clientSettings.DEBUG)
            console.error("Error loading studio model:", e);
          this.loadErrorModel(object, position, rotation, quality);
        }
      }
    }

    if (!root) return;

    // add to list of added objects
    this.currentObjects.push(root as Mesh);

    this._setGPUPickerPickList();

    // this.renderScene();

    // add to savedStep for undo/redo
    if (doNotSaveState === false) {
      this.saveState("add", {
        mesh: root,
      });

      this.gizmoManager.attachToMesh(root as Mesh);
      this.saveState("select", {
        mesh: root,
      });
    }
  }

  async loadStudioImageObject(
    object: StudioObject,
    quality: "high" | "low" = "high",
    position?: ObjectTransform,
    rotation?: ObjectTransform,
    scale?: ObjectTransform,
    hyperlink?: HyperLinkData,
    doNotSaveState: boolean = false
  ): Promise<Mesh | undefined> {
    const { id, path, title, type, subType } = object;

    const imagePath = `${path}/image_${quality}.jpg`;

    // load image from server (not pretty...)
    let res: Response | null = null;
    try {
      res = await fetch(imagePath);
    } catch (e) {
      // empty
    }

    if (!res) {
      try {
        res = await fetch(`${path}/image.jpg`);
      } catch (e) {
        // empty
      }
    }

    if (!res) {
      try {
        res = await fetch(`${path}/model.jpg`);
      } catch (e) {
        if (clientSettings.DEBUG) console.error("Error fetching image:", e);
      }
    }

    if (!res) return;

    const blob = await res.blob();

    // create image object to get image dimensions
    const image = new Image();
    image.src = URL.createObjectURL(blob);

    const root = CreatePlane(
      imagePath,
      {
        size: 1.3,
        sideOrientation: 2, // Mesh.DOUBLESIDE
      },
      this.scene
    );
    const material = new PBRMaterial(imagePath + "_material", this.scene);

    const texture = new Texture(
      URL.createObjectURL(blob),
      this.scene,
      true, // noMipmapOrOptions
      true, // invertY
      Texture.TRILINEAR_SAMPLINGMODE,
      undefined,
      undefined,
      blob,
      true
    );
    // flip texture horizontally
    texture.uScale = -1;

    material.albedoTexture = texture;
    material.metallic = 0.4;
    material.roughness = 0.85;
    material.albedoTexture.hasAlpha = true;
    material.albedoTexture.optimizeUVAllocation = true;
    material.albedoTexture.onDispose = () => {
      URL.revokeObjectURL(image.src);
    };
    root.material = material;

    // update plane aspect ratio to match image aspect ratio
    image.onload = () => {
      if (doNotSaveState === false) {
        const aspectRatio = image.width / image.height;
        root.scaling.x = aspectRatio * root.scaling.y;
      }
      material.markDirty(true);
      // this.renderScene();
    };

    if (hyperlink && hyperlink.useAsPortal && hyperlink.link.startsWith("/")) {
      let domain = clientSettings.DOMAIN;
      if (domain.startsWith("http://localhost:")) {
        domain = "https://adler-dev3.vercel.app";
      }
      hyperlink.link = domain + hyperlink.link;
    }

    // update root mesh metadata to let application know
    // what object type it is to update correct gizmo axis
    root.metadata = {
      id,
      name: title,
      type,
      subType: subType ?? "image",
      type3D: "decoration",
      hyperlink,
    } as StudioMeshMetaData;

    if (position) root.position = Vector3.FromArray(position);
    else root.position.setAll(0);

    root.rotationQuaternion = null;
    root.rotation = rotation ? Vector3.FromArray(rotation) : Vector3.Zero();
    root.scaling = scale ? Vector3.FromArray(scale) : Vector3.One();

    // root.isPickable = isSafari();
    root.alwaysSelectAsActiveMesh = true;

    // this.renderScene();

    return root;
  }

  async loadErrorModel(
    object: StudioObject,
    position?: ObjectTransform,
    rotation?: ObjectTransform,
    quality: "high" | "low" = "high"
  ): Promise<void> {
    const processMeshes = (meshes: AbstractMesh[]) => {
      const root = meshes[0];
      meshes.forEach((mesh) => {
        if (mesh.material) {
          const mat = mesh.material as PBRMaterial;
          mat.disableLighting = true;
          mat.specularIntensity = 0;
          mat.emissiveColor = Color3.Red();
          mat.emissiveIntensity = 1;
          mat.metallic = 0;
          mat.roughness = 1;
          mat.freeze();
        }
        // mesh.isPickable = isSafari();
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
        mesh.layerMask = 1 << 1; // visible on layer 2
      });

      root.metadata = {
        id: object.id,
        name: object.title,
        type: object.type,
        subType: object.subType,
        type3D: STUDIO_OBJECT_TYPE_DICTIONARY[object.subType] ?? "ground",
        isError: true,
        position,
        rotation,
        scale: [1, 1, 1],
      } as StudioMeshMetaData;

      root.position = position
        ? Vector3.FromArray(position)
        : Vector3.ZeroReadOnly;
      root.rotation = rotation
        ? Vector3.FromArray(rotation)
        : Vector3.ZeroReadOnly;

      this.currentObjects.push(root);

      // lock object to prevent moving
      root.getChildMeshes().forEach((child) => {
        child.doNotSyncBoundingInfo = true;
        child.freezeWorldMatrix();
      });
      this.lockedObjects.push(root.uniqueId);

      this._setGPUPickerPickList(meshes);
    };

    try {
      const container = await loadAssetContainerAsync(
        `${clientSettings.PUBLIC_FOLDER_DOMAIN}static/models/missing_asset_${quality}.glb`,
        this.scene,
        {
          pluginExtension: ".glb",
        }
      );
      container.addAllToScene();
      processMeshes(container.meshes);
    } catch (e) {
      try {
        const container = await loadAssetContainerAsync(
          `/static/models/missing_asset_${quality}.glb`,
          this.scene,
          {
            pluginExtension: ".glb",
          }
        );
        container.addAllToScene();
        processMeshes(container.meshes);
      } catch (e) {
        if (clientSettings.DEBUG)
          console.error("Failed to load error model:", e);
      }
    }
  }

  async loadHyperLinkAnchor(
    parent: AbstractMesh | Mesh | TransformNode,
    saveState: boolean = true
  ): Promise<void> {
    if (parent.metadata && Object.hasOwn(parent.metadata, "hyperlinkMesh")) {
      return;
    }

    parent.metadata.hyperlinkMesh = 9999; // placeholder to prevent race condition

    const processMeshes = (root: AbstractMesh) => {
      root.getChildMeshes().forEach((mesh) => {
        const childMeshName = mesh.name;
        mesh.name = "hyperlinkAnchorMeshChild_" + childMeshName;
        mesh.isPickable = false;
        mesh.layerMask = 1 << 1; // visible on layer 2
        // if (this.highlightLayer) {
        //     this.highlightLayer.removeMesh(mesh as Mesh);
        //     this.highlightLayer.addExcludedMesh(mesh as Mesh);
        // }
      });

      // slightly tilt the anchor
      root.rotationQuaternion = null;
      root.rotation.x = Math.PI * 0.1;

      parent.metadata.hyperlinkMesh = root.uniqueId;

      // spin anchor
      this._hLinkAnchorRotationObservers.set(
        root,
        this.scene.onBeforeRenderObservable.add(() => {
          root.rotation.y +=
            (0.9 * this.scene.getEngine().getDeltaTime()) / 1000;
        })
      );

      const topOfParent = parent.getHierarchyBoundingVectors(true).max.y;
      const parentAbsolutePosition = parent.getAbsolutePosition();

      // place anchor on top of parent
      root.setAbsolutePosition(
        new Vector3(
          parentAbsolutePosition.x,
          topOfParent + 0.25,
          parentAbsolutePosition.z
        )
      );
      root.setParent(parent, undefined, true);
    };

    const rootMesh = this.scene.getMeshByName("hyperlinkAnchorMesh");

    if (rootMesh) {
      const clone = rootMesh.clone(
        "hyperlinkAnchorMesh_clone_" + parent.uniqueId,
        null
      )!;
      processMeshes(clone);
      if (saveState === true) {
        // this.saveState('addhyperlink', {
        //   mesh: parent,
        //   hyperlinkData: parent.metadata.hyperlink,
        // });
      }
      return;
    }

    const container = await loadAssetContainerAsync(
      "/static/models/anchor.glb",
      this.scene,
      {
        pluginExtension: ".glb",
        pluginOptions: {
          gltf: {
            compileMaterials: true,
            // customRootNode: tNode,
          },
        },
      }
    );
    container.addAllToScene();
    container.meshes[0].name = "hyperlinkAnchorMesh";
    processMeshes(container.meshes[0]);

    if (saveState === true) {
      // this.saveState('addhyperlink', {
      //   mesh: parent,
      //   hyperlinkData: parent.metadata.hyperlink,
      // });
    }
  }

  removeHyperLinkAnchor(root: AbstractMesh | Mesh, saveState: boolean = true) {
    if (!root.metadata || !Object.hasOwn(root.metadata, "hyperlinkMesh")) {
      return;
    }

    const hyperlinkObject = this.scene.getMeshByUniqueId(
      root.metadata.hyperlinkMesh
    );

    if (!hyperlinkObject) return;

    hyperlinkObject.dispose();

    const observers = this._hLinkAnchorRotationObservers.get(root);
    if (observers) {
      this.scene.onBeforeRenderObservable.remove(observers);
      this._hLinkAnchorRotationObservers.delete(root);
    }

    delete root.metadata.hyperlinkMesh;
    if (Object.hasOwn(root.metadata, "hyperlink"))
      delete root.metadata.hyperlink;

    if (saveState) {
      // this.saveState('removehyperlink', {
      //   mesh: root,
      //   hyperlinkData: root.metadata.hyperlink,
      // });
    }
  }

  async setImageForAddedStudioObject(
    rootNode: TransformNode,
    rootMesh: AbstractMesh | Mesh,
    imageName: string,
    newMaterial: boolean = false
  ): Promise<void> {
    // path is required to load image
    if (!this.postData?.path) return;

    const src = `${this.postData.path}/${imageName}.${isSafari() || isFirefox() ? "jpg" : "avif"
      }`;

    try {
      const res = await fetch(src);
      const blob = await res.blob();

      const file = new File([blob], imageName, {
        type: isSafari() || isFirefox() ? "image/jpg" : "image/avif",
      });
      (rootNode.metadata as StudioMeshMetaData).imageContent = { src, file };

      this._addImageTextureToObject(
        rootMesh,
        URL.createObjectURL(blob),
        newMaterial
      );
    } catch (e) {
      if (clientSettings.DEBUG) console.error("Error fetching image:", e);
    }
  }

  fixImageAspectRatio(): void {
    const object = this.gizmoManager.attachedMesh;
    if (!object || object.metadata.type !== "images") return;
    if (
      !object.material ||
      !(object.material instanceof PBRMaterial) ||
      !object.material.albedoTexture
    )
      return;

    const storedMeshTransforms: ObjectAbsoluteTransforms = {
      absolutePosition: object.getAbsolutePosition().asArray(),
      absoluteRotationQuaternion: object.absoluteRotationQuaternion.asArray(),
      absoluteScaling: object.absoluteScaling.asArray(),
    };

    const texture = object.material.albedoTexture as Texture;
    const sizes = texture.getSize();
    const aspectRatio = sizes.width / sizes.height;
    object.scaling.x = aspectRatio * object.scaling.y;

    const newTransforms: ObjectAbsoluteTransforms = {
      absolutePosition: object.getAbsolutePosition().asArray(),
      absoluteRotationQuaternion: object.absoluteRotationQuaternion.asArray(),
      absoluteScaling: object.absoluteScaling.asArray(),
    };

    this.saveState("scale", {
      mesh: object,
      old: storedMeshTransforms,
      new: newTransforms,
    });
  }

  copyObjects() {
    if (!this.gizmoManager.attachedMesh) return;
    if (this.gizmoManager.attachedMesh === this.userSpawnPlane) return;
    this.copiedMesh = this.gizmoManager.attachedMesh;
  }

  pasteObjects() {
    if (!this.copiedMesh) return;
    this.duplicateObjects(this.copiedMesh);
  }

  duplicateObjects(mesh?: AbstractMesh | Mesh) {
    if (this.gizmoManager.attachedMesh === this.userSpawnPlane) return;

    const meshToClone = mesh ?? this.gizmoManager.attachedMesh;
    if (!meshToClone || meshToClone === this.userSpawnPlane) return;

    if (meshToClone === this.selectedMeshGroup) {
      const children = meshToClone.getChildren();
      const clones: Array<AbstractMesh> = [];
      (children as Array<AbstractMesh>).forEach((child) => {
        const clone = child.clone(
          child.name + "_" + this.currentObjects.length,
          null,
          false
        )!;
        clone.metadata = child.metadata;

        clones.push(clone);
        this.currentObjects.push(clone);
      });

      // remove old children from group node, set new children
      children.forEach((child) => (child as AbstractMesh).setParent(null));
      clones.forEach((clone) => clone.setParent(this.selectedMeshGroup));

      this._attachGizmoToGroupNode();
      this._setGPUPickerPickList();

      // show outline for all objects in group
      this.showObjectOutlineForGroup(this.selectedMeshGroup.getChildren());

      this.saveState("duplicate", {
        meshes: clones,
        priorSelectedMeshes: children,
      });

      this.onObjectDuplicateObservable.notifyObservers(clones);

      return;
    }

    // if is picture frame and don't have image content, don't clone
    if (
      meshToClone.metadata.subType === "picture_frame" &&
      !meshToClone.metadata.imageContent
    ) {
      (async () => {
        const asset = await this.engineCore.loadAsset(meshToClone.metadata.id);
        if (!asset) {
          if (clientSettings.DEBUG)
            console.error(
              `Failed to load studio painting asset ${meshToClone.metadata.id}`
            );
          return;
        }
        this.addStudioObject(
          asset as StudioObject,
          isMobile() ? "low" : "high",
          false,
          meshToClone.position.asArray(),
          meshToClone.rotation.asArray(),
          meshToClone.scaling.asArray(),
          undefined,
          undefined,
          true
        );
      })();

      return;
    }

    const clone = meshToClone.clone(
      meshToClone.name + "_" + this.currentObjects.length,
      null,
      false
    )!;
    clone.metadata = meshToClone.metadata;

    this.hideObjectOutline(meshToClone);
    this.gizmoManager.attachToMesh(clone);

    this.currentObjects.push(clone);

    this._setGPUPickerPickList();

    this.saveState("duplicate", {
      mesh: clone,
      priorSelectedMesh: meshToClone,
    });

    this.onObjectDuplicateObservable.notifyObservers(clone);
  }

  async changeHDRSkybox(skyboxId: string, doNotSaveState: boolean = false) {
    const asset = await this.engineCore.loadAsset(skyboxId);
    if (!asset) {
      if (clientSettings.DEBUG)
        console.error("Error loading skybox asset", skyboxId);
      return;
    }
    const studioObject = asset as StudioObject;

    this.currentSkyboxData = studioObject;

    const filePath = `${studioObject.path}/resource.env`;
    const resource = await this.atomResources.getResource(
      studioObject.id,
      filePath,
      false
    );

    if (!resource) return;

    const envMapTexture = CubeTexture.CreateFromPrefilteredData(
      resource.url,
      this.scene,
      ".env",
      false
    );
    envMapTexture.optimizeUVAllocation = true;

    const skyboxReflectionTexture = envMapTexture.clone();
    skyboxReflectionTexture.optimizeUVAllocation = true;

    // wait for textures to finish loading
    await Promise.all([
      new Promise<void>((resolve) => {
        envMapTexture.onLoadObservable.addOnce(() => {
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        skyboxReflectionTexture.onLoadObservable.addOnce(() => {
          resolve();
        });
      }),
    ]);

    this.scene.meshes.forEach((mesh) => {
      mesh.material?.unfreeze();
    });

    this.scene.blockMaterialDirtyMechanism = true;

    this.scene.environmentTexture?.dispose();
    this.scene.environmentTexture = envMapTexture;

    // update skybox material
    const skyboxMaterial = this.skybox.material as PBRMaterial;
    skyboxMaterial.reflectionTexture?.dispose();
    skyboxMaterial.reflectionTexture = skyboxReflectionTexture;
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.markDirty(true);

    this.scene.blockMaterialDirtyMechanism = false;

    // this.renderScene();

    this.scene.onAfterRenderObservable.addOnce(() => {
      this.scene.meshes.forEach((mesh) => {
        mesh.material?.freeze();
      });
      // this.renderScene();
    });

    if (doNotSaveState === false) {
      this.saveState("changeSkybox", {
        old: this.currentSkyboxData.id,
        new: skyboxId,
        name: studioObject.title,
      });
    }
  }

  
  /** Save state for undo/redo */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveState(type: StudioSavedStateType, data: any) {
    // if max undo/redo count is reached, remove the oldest state
    if (this.savedStates.length >= MAX_UNDO_REDO_COUNT) {
      this.savedStates.shift();
    }

    // get current date in YYYY-MM-DD HH:MM:SS format
    const currentDate = new Date();
    const date = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1
      }-${currentDate.getDate()} ${currentDate.getHours()}:${currentDate.getMinutes()}:${currentDate.getSeconds()}`;

    // save state
    this.savedStates[this.currentStateIndex] = {
      uid: v4(),
      date,
      type,
      data,
    };

    if (
      Object.hasOwn(data, "mesh") &&
      data.mesh instanceof TransformNode &&
      data.mesh.metadata?.subType
    ) {
      this.savedStates[this.currentStateIndex].name =
        data.mesh.metadata.subType;
    } else if (Object.hasOwn(data, "meshes")) {
      this.savedStates[this.currentStateIndex].name = "group";
    } else if (data.name) {
      this.savedStates[this.currentStateIndex].name = data.name;
    }

    // truncate all after current index
    if (this.currentStateIndex < this.savedStates.length - 1) {
      this.savedStates.splice(this.currentStateIndex + 1);
    }

    if (this.savedStates.length < MAX_UNDO_REDO_COUNT) {
      this.currentStateIndex++;
    }

    if (clientSettings.DEBUG) console.log("Saved states:", this.savedStates);

    this.onSaveStateObservable.notifyObservers({
      savedStates: this.savedStates,
      currentStateIndex: this.currentStateIndex,
    });

    // this.renderScene();
  }

  attachCorrectCamera(
    mode: "edit" | "preview" | "thumbnail" | "spawn" = "edit"
  ): void {
    switch (mode) {
      case "edit": {
        this.avatarCamera.detachControl();
        this.editSpawnAreaCamera.detachControl();
        this.thumbnailCamera?.detachControl();
        this.scene.activeCamera = this.camera;
        this.camera.attachControl();
        this.gizmoManager.utilityLayer.setRenderCamera(this.camera);
        break;
      }
      case "preview": {
        this.camera.detachControl();
        this.editSpawnAreaCamera.detachControl();
        this.thumbnailCamera?.detachControl();
        this.scene.activeCamera = this.avatarCamera;
        this.avatarCamera.attachControl();
        break;
      }
      case "thumbnail": {
        this.camera.detachControl();
        this.avatarCamera.detachControl();
        this.editSpawnAreaCamera.detachControl();
        this.scene.activeCamera = this.thumbnailCamera;
        this.thumbnailCamera?.attachControl();
        break;
      }
      case "spawn": {
        this.camera.detachControl();
        this.avatarCamera.detachControl();
        this.thumbnailCamera?.detachControl();
        this.scene.activeCamera = this.editSpawnAreaCamera;
        this.editSpawnAreaCamera.attachControl();
        this.gizmoManager.utilityLayer.setRenderCamera(
          this.editSpawnAreaCamera
        );
        break;
      }
    }
  }

  async setPreviewMode(
    isPreview: boolean,
    isFromDashboard: boolean = false
  ): Promise<boolean> {
    this.isEditSpawnAreaMode = false;
    this.isThumbnailCaptureMode = false;

    await Promise.all([
      this.engineCore.waitForHavokPhysicsToLoad(),
      waitForConditionAndExecute(() => this.avatarModelInfo !== null),
    ]);

    if (!this.avatar) {
      this.avatar = new Avatar(this.scene, this.avatarModelInfo!, this);
    }
    if (!this.avatarController) {
      this.avatarController = new AvatarController(
        this.avatar,
        this.avatarCamera,
        this.scene
      );
    }

    if (isPreview === true) {
      // already in preview mode
      if (this.isPreviewMode === true) return false;

      if (isFromDashboard) {
        if (this._isDraftLoaded === true) {
          window.localStorage.removeItem("previewFromDashboard");
        } else {
          await new Promise<void>((resolve) => {
            this._onDraftLoadedObservers.addOnce(() => {
              window.localStorage.removeItem("previewFromDashboard");
              resolve();
            });
          });
        }
      }

      if (this.currentObjects.length === 0) return false;

      if (!this.gpuPicker) {
        this.scene.skipPointerMovePicking = true;
        this.scene.skipPointerDownPicking = true;
        this.scene.skipPointerUpPicking = true;
      }

      this.orbitGizmo.hide();
      this.floorGrid.isVisible = false;
      this.loadCollisions();

      if (this.avatarController.cameraMode === "thirdPerson")
        this.avatar.show(true);

      if (this._isSpawnAreaUpdated) {
        this._respawnAvatar();
        this._isSpawnAreaUpdated = false;
      }

      this.forceRenderScene = true;

      if (this.avatar.rootMesh) {
        this.attachCorrectCamera("preview");
        this.avatarController.start();
      } else {
        this._respawnAvatar();

        this.avatar.loadAvatar().then((avatar) => {
          avatar.loadPhysicsBodies(avatar.skeleton ?? undefined);

          if (this.isPreviewMode === false) {
            avatar.hide(true);
            this.forceRenderScene = false;
            if (this.isEditSpawnAreaMode) this.attachCorrectCamera("spawn");
            else if (this.isThumbnailCaptureMode)
              this.attachCorrectCamera("thumbnail");
            else this.attachCorrectCamera("edit");
            return true;
          }

          if (this.avatarController?.cameraMode === "thirdPerson")
            avatar.show(true);
          this.attachCorrectCamera("preview");
          this.avatarController?.start();

          // setTimeout(() => {
          //   this.avatar?.capsuleBody?.applyImpulse(
          //     new Vector3(0, 50, 0),
          //     new Vector3(pos.x, pos.y - 0.2, pos.z)
          //   );
          // }, 300);

          if (avatar.capsuleBody !== null) {
            avatar.setFallTimeoutCallback(() => this._respawnAvatar());
          } else {
            eventBus.once(
              `avatar:capsuleBodyCreated:${avatar.user?.id}`,
              () => {
                avatar.setFallTimeoutCallback(() => this._respawnAvatar());
              }
            );
          }
          this.forceRenderScene = false;
        });
      }
    } else {
      this.theme.physicsAggregates.forEach((agg) => {
        agg.dispose();
      });
      this.theme.physicsAggregates = [];
      this._addedObjectsPhysicsAggregates.forEach((agg) => agg.dispose());
      this._addedObjectsPhysicsAggregates = [];

      this.avatar.hide(true);
      this.avatarController.stop();
      this.floorGrid.isVisible = true;

      this.orbitGizmo.show();

      if (this.isEditSpawnAreaMode) {
        this.attachCorrectCamera("spawn");
      } else if (this.isThumbnailCaptureMode) {
        this.attachCorrectCamera("thumbnail");
      } else {
        this.switchToEditMode();
      }
    }

    this.isPreviewMode = isPreview;

    // this.renderScene();

    return true;
  }

  private _respawnAvatar(): void {
    if (!this.avatar) return;

    // spawn avatar within the 4 corners of the user spawn plane
    const vectors = this.theme.userSpawnInfo.corners;
    const pos = new Vector3(
      lerp(vectors[0][0], vectors[1][0], getRandomFloatBetween(0.2, 0.8)),
      lerp(vectors[0][1], vectors[1][1], getRandomFloatBetween(0.2, 0.8)),
      lerp(vectors[0][2], vectors[1][2], getRandomFloatBetween(0.2, 0.8))
    );
    this.avatar.setPosition(pos);

    // set avatar root forward direction to be the same direction as the user spawn plane
    this.avatar.root.setDirection(
      Vector3.FromArray(this.theme.userSpawnInfo.target)
    );
  }

  switchToEditMode() {
    this.attachCorrectCamera("edit");

    if (!this.gpuPicker) {
      this.scene.skipPointerMovePicking = false;
      this.scene.skipPointerDownPicking = false;
      this.scene.skipPointerUpPicking = false;
    }
  }

  setThumbnailCaptureMode(isMode: boolean) {
    this.isThumbnailCaptureMode = isMode;

    if (isMode) {
      if (this.thumbnailCamera === null) {
        this.thumbnailCamera = this._createOtherCamera("thumbnailCamera");
      }

      this.attachCorrectCamera("thumbnail");

      if (!this.gpuPicker) {
        this.scene.skipPointerMovePicking = true;
        this.scene.skipPointerDownPicking = true;
        this.scene.skipPointerUpPicking = true;
      }
    } else {
      if (this.isPreviewMode) {
        this.attachCorrectCamera("preview");
      } else if (this.isEditSpawnAreaMode) {
        this.attachCorrectCamera("spawn");
      } else {
        this.switchToEditMode();
      }
    }

    // this.renderScene();
  }

  setEditSpawnAreaMode(isEdit: boolean) {
    if (this.userSpawnPlane === null) {
      this.userSpawnPlane = this._createUserSpawnPlane();
    }

    if (isEdit === true) {
      this.oldSelectedMesh = this.gizmoManager.attachedMesh;

      this.gizmoManager.attachToMesh(this.userSpawnPlane as Mesh);

      if (!this.gpuPicker) {
        this.scene.skipPointerMovePicking = true;
        this.scene.skipPointerDownPicking = true;
        this.scene.skipPointerUpPicking = true;
      }

      this.userSpawnPlane.setEnabled(true);

      this.editSpawnAreaCamera.target = this.userSpawnPlane.position.clone();

      this.attachCorrectCamera("spawn");

      this.isEditSpawnAreaMode = true;
    } else {
      this.gizmoManager.attachToMesh(this.oldSelectedMesh);

      this.userSpawnPlane.setEnabled(false);

      this.isEditSpawnAreaMode = false;

      if (this.isPreviewMode) {
        this.attachCorrectCamera("preview");
      } else if (this.isThumbnailCaptureMode) {
        this.attachCorrectCamera("thumbnail");
      } else {
        this.switchToEditMode();
      }
    }

    // this.renderScene();
  }

  setThemeScale(scale: number) {
    if (this.theme.atomRoot) {
      this.theme.scale = [scale, scale, scale];

      this.theme.atomMeshes.forEach((mesh) => {
        mesh.doNotSyncBoundingInfo = false;
        mesh.unfreezeWorldMatrix();
      });

      this.theme.atomRoot.scaling = new Vector3(-scale, scale, scale);

      this.theme.atomMeshes.forEach((mesh) => {
        mesh.doNotSyncBoundingInfo = true;
        mesh.freezeWorldMatrix();
      });

      // this.renderScene();
    }
  }

  loadCollisions() {
    this.theme.physicsAggregates.forEach((agg) => {
      agg.dispose();
    });
    this.theme.physicsAggregates = [];

    this._addedObjectsPhysicsAggregates.forEach((agg) => {
      agg.dispose();
    });
    this._addedObjectsPhysicsAggregates = [];

    let includedMeshes: Array<string> = [];
    switch (this.theme.name) {
      // case 'party': {
      //   includedMeshes = [
      //     'Bar_BigTable',
      //     'Bar_door',
      //     'BarStool',
      //     'Celling',
      //     'Celling_deco_main ',
      //     'Concert_Stage_down',
      //     'Concert_Stage_up',
      //     'Concert_stage_lif',
      //     'Curtains',
      //     'Door',
      //     'Floor',
      //     'Floor_Bar',
      //     'Piano',
      //     'Piano_Stool',
      //     'Pillar',
      //     'Stanchion',
      //     'StandMiC',
      //     'Wall',
      //     'Wall_deco',
      //     'Window',
      //   ];
      //   break;
      // }
      case "museum": {
        includedMeshes = [
          "Door",
          "Funeral_Alter_Black_Low",
          "Funeral_Alter_White_Low",
          "Passage",
          "Pillars ",
          "Pillars_angle",
          "Tile Floor",
          "Wall_Clean",
          "Wall_Frame_A",
          "Wall_MainPart",
        ];
        break;
      }
      // case 'home': {
      //   includedMeshes = [
      //     'Curtain',
      //     'Curtain_Flip',
      //     'Door',
      //     'DoorB',
      //     'Floor',
      //     'WallA_Coner',
      //     'WallA_Y',
      //     'WallB_X',
      //     'Window',
      //   ];
      //   break;
      // }
    }

    this.theme.atomMeshes.forEach((mesh) => {
      mesh.doNotSyncBoundingInfo = false;
      mesh.unfreezeWorldMatrix();
    });

    this.theme.atomMeshes.forEach((mesh) => {
      // if mesh name is not in list or mesh name does not include any in list
      if (
        includedMeshes.length > 0 &&
        !includedMeshes.includes(mesh.name) &&
        !includedMeshes.find((meshName) => mesh.name.includes(meshName))
      )
        return;

      const agg = new PhysicsAggregate(
        mesh,
        6,
        { mass: 0, friction: 0.6, restitution: 0.01, startAsleep: true },
        this.scene
      );
      agg.shape.filterMembershipMask = PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
      this.theme.physicsAggregates.push(agg);
    });

    this.theme.atomMeshes.forEach((mesh) => {
      mesh.doNotSyncBoundingInfo = true;
      mesh.freezeWorldMatrix();
    });

    // generate physics for added objects
    this.currentObjects.forEach((root) => {
      root
        .getChildMeshes(
          false,
          (mesh) =>
            mesh.id !== "__root__" &&
            (mesh.getClassName() === "AbstractMesh" ||
              mesh.getClassName() === "Mesh") &&
            (mesh as Mesh).geometry !== null &&
            !mesh.name.includes("hyperlinkAnchorMesh")
        )
        .forEach((mesh) => {
          const agg = new PhysicsAggregate(
            mesh,
            6,
            { mass: 0, friction: 0.6, restitution: 0.01, startAsleep: true },
            this.scene
          );
          agg.shape.filterMembershipMask =
            PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
          this._addedObjectsPhysicsAggregates.push(agg);
        });
    });
  }

  cancelSettingUserSpawnArea() {
    if (!this.isEditSpawnAreaMode) return;
    if (!this.userSpawnPlane) return;

    if (this._previousSpawnPlaneTransforms === null) {
      this.userSpawnPlane.dispose();
      this.userSpawnPlane = null;
    } else {
      this.userSpawnPlane.position.copyFrom(
        this._previousSpawnPlaneTransforms.position
      );
      this.userSpawnPlane.rotation.copyFrom(
        this._previousSpawnPlaneTransforms.rotation
      );
      this.userSpawnPlane.scaling.copyFrom(
        this._previousSpawnPlaneTransforms.scaling
      );
    }
  }

  setUserSpawnArea() {
    if (!this.isEditSpawnAreaMode) return;
    if (!this.userSpawnPlane) return;

    this._previousSpawnPlaneTransforms = {
      position: this.userSpawnPlane.position,
      rotation: this.userSpawnPlane.rotation,
      scaling: this.userSpawnPlane.scaling,
    };
    this._isSpawnAreaUpdated = true;
  }

  resetUserSpawnArea() {
    if (!this.isEditSpawnAreaMode) return;
    this._detachMeshFromGizmo();

    this.userSpawnPlane?.dispose(false, true);
    this.userSpawnPlane = this._createUserSpawnPlane([
      Vector3.FromArray([-1.25, 0, -1]),
      Vector3.FromArray([1.25, 0, -1]),
      Vector3.FromArray([1.25, 0, 1]),
      Vector3.FromArray([-1.25, 0, 1]),
      Vector3.FromArray([-1.25, 0, -1]),
    ]);

    this.gizmoManager.attachToMesh(this.userSpawnPlane as Mesh);
  }

  async createThumbnail(): Promise<ThumbnailScreenshots | null> {
    if (this.scene === null || this.scene.isDisposed)
      throw new Error("No scene to export");
    if (this.thumbnailCamera === null || this.thumbnailCamera.isDisposed()) {
      this.thumbnailCamera = this._createOtherCamera(
        "thumbnailCamera",
        this.camera.fov,
        this.camera.position,
        this.camera.target
      );
    }

    // fix camera aspect ratio before taking screenshot
    this.engineCore.resize();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screenshots: any = {};

    // take screenshots with different FOV for mobile and PC/tablet
    for (const [deviceType, { width, height }] of Object.entries(
      THUMBNAIL_RESOLUTIONS
    )) {
      this.thumbnailCamera.fov = deviceType === "mobile" ? 2 : 0.8;
      this.scene.render();

      await new Promise<void>((resolve) => {
        this.scene.onAfterRenderObservable.addOnce(() => {
          resolve();
        });
      });

      const base64 =
        await ScreenshotTools.CreateScreenshotUsingRenderTargetAsync(
          this.engine,
          this.thumbnailCamera,
          {
            width,
            height,
            precision: 1,
          },
          "image/jpeg",
          undefined,
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          1
        );
      const res = await fetch(base64);
      const blob = await res.blob();
      if (blob) {
        screenshots[deviceType as ThumbnailDeviceType] = blob;
      } else {
        if (clientSettings.DEBUG)
          console.error(
            "Couldn't capture thumbnail for device type " + deviceType
          );
        throw new Error(
          "Couldn't capture thumbnail for device type " + deviceType
        );
      }
    }

    // Restore settings
    this.thumbnailCamera.fov = 0.8;
    if (this.isPreviewMode) {
      if (this.avatarController?.cameraMode === "thirdPerson")
        this.avatar?.show(true);
    }

    this.scene.render();

    return screenshots;
  }

  addImageToPainting(content: Content, mesh: AbstractMesh | Mesh) {
    if (mesh.metadata.subType !== "picture_frame") {
      if (clientSettings.DEBUG) console.error("Invalid mesh type");
      return;
    }

    (mesh.metadata as StudioMeshMetaData).imageContent = {
      src: content.imageSrc,
      file: content.file,
    };

    this._addImageTextureToObject(mesh, content.imageSrc);

    // this.renderScene();
  }

  private _addImageTextureToObject(
    rootMesh: AbstractMesh,
    src: string,
    newMaterial: boolean = false
  ) {
    rootMesh.getChildMeshes().forEach((child) => {
      if (
        !child.material ||
        !(child.material instanceof PBRMaterial) ||
        child.material.id !== "picture"
      )
        return;

      const texture = new Texture(src, this.scene, true, false);
      texture.optimizeUVAllocation = true;
      texture.isBlocking = false;

      let material: PBRMaterial;
      if (newMaterial) {
        material = new PBRMaterial("picture_" + child.uniqueId, this.scene);
        child.material = material;
      } else {
        material = child.material;
      }

      material.albedoTexture?.dispose();
      material.albedoTexture = texture;
      material.useAlphaFromAlbedoTexture = true; // use alpha channel from texture
      material.markDirty(true);

      texture.onLoadObservable.addOnce(() => {
        // this.renderScene();
      });
    });
  }

  /**
   * Dispose all objects with matching asset id from the scene
   * and remove them from the added objects list
   * @param assetId asset id to remove
   */
  disposeAssetFromScene(assetId: string): void {
    const objectsToDispose: Array<AbstractMesh> = [];
    this.currentObjects = this.currentObjects.filter((mesh) => {
      if (mesh.metadata.id === assetId) {
        objectsToDispose.push(mesh);
        return false;
      }
      return true;
    });
    objectsToDispose.forEach((mesh) => {
      if (this.gizmoManager.attachedMesh === mesh) {
        this._detachMeshFromGizmo();
      }
      mesh.dispose(false, true);
    });

    // remove from cache and IDB
    this.engineCore.loadedAdlerAssets.delete(assetId);
    if (this.engineCore.indexedDB) {
      this.engineCore.indexedDB
        .transaction("assetsBE", "readwrite")
        .store.delete(assetId);
    }

    // this.renderScene();
  }

  private _startIdleTimeout(): void {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);
    console.log("start set idle timeout");

    this.idleTimeout = setTimeout(() => {
      this.isIdle = true;
    }, IDLE_TIMEOUT);
  }

  renderScene(updateCamera: boolean = true): void {
    if (this.dontRenderScene) return;

    try {
      this.scene.render(updateCamera);
      if (this.isPreviewMode || this.isThumbnailCaptureMode) return;
      this.orbitGizmo.render();
    } catch (e) {
      // empty
    }
  }

  runEngineRenderLoop(): void {
    // this.renderScene();

    this.engine.stopRenderLoop(); // clear existing render loops
    this.engine.runRenderLoop(() => {
      if (!this.scene || this.scene.isDisposed) return;

      switch (true) {
        case !this.engineCore.isPageInView:
        case !this.engineCore.isPageActive:
        case this.scene.activeCamera === null: {
          return;
        }
      }

      // special cases (always render when these conditions are true)
      if (
        this.forceRenderScene === true ||
        this.isPreviewMode ||
        // (POINTER_INFO.isPointerDown && POINTER_INFO.isPointerMoving) ||
        this.scene.animations.length > 0 ||
        this._hLinkAnchorRotationObservers.size > 0 ||
        this.gizmoManager.attachedMesh !== null ||
        (this.isEditSpawnAreaMode && this.gizmoManager.attachedMesh === null) ||
        this.orbitGizmo.isPlayingAnimation === true
      ) {
        this.renderScene();
        return;
      }

      if (this.isIdle) return;

      // switch (true) {
      //   case this.scene.activeCamera === this.camera && isArcRotateCameraStopped(this.camera):
      //   case this.scene.activeCamera === this.editSpawnAreaCamera:
      //     return;
      // }

      this.renderScene();
    });
  }

  insertCanvasToWrapper(wrapper: HTMLElement) {
    wrapper.appendChild(this.canvas);
  }

  onActivate(): void {
    this.onResize();

    (async () => {
      if (this.user?.isGuest === true) {
        // user is not logged in
        const { id, gender } =
          avatarJSON[getRandomIntBetween(0, avatarJSON.length - 1)];
        const baseURL =
          clientSettings.PUBLIC_FOLDER_DOMAIN + "static/avatar/guests/" + id;
        this.engineCore.setAvatar({
          id: id,
          gender: gender as AvatarGender,
          lowQualityUrl: baseURL + "_low.glb",
          mediumQualityUrl: baseURL + "_low.glb",
          highQualityUrl: baseURL + "_high.glb",
        });
      } else {
        // user is logged in
        const { avatarId, gender, lowQuality, mediumQuality, highQuality } =
          await fetchUserAvatarInfo();
        this.engineCore.setAvatar({
          id: avatarId,
          gender: gender as AvatarGender,
          lowQualityUrl: `https://${clientSettings.IMAGE_DOMAIN}/` + lowQuality,
          mediumQualityUrl:
            `https://${clientSettings.IMAGE_DOMAIN}/` + mediumQuality,
          highQualityUrl:
            `https://${clientSettings.IMAGE_DOMAIN}/` + highQuality,
        });
      }
    })();
    this.runEngineRenderLoop();
  }

  onResize(): void {
    // this.engine.onResizeObservable.addOnce(() => {
    //   this.renderScene();
    // });
    this.engineCore.resize();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _requestPostRender(): void {
    // left empty on purpose
  }

  dispose(): void {
    if (this.idleTimeout) clearTimeout(this.idleTimeout);

    this.engine.stopRenderLoop(); // clear existing render loops

    this._keyPressRenderObservable?.remove();

    this.canvas.remove();
    this.theme.atomRoot = null;
    this.theme.physicsAggregates = [];
    this._addedObjectsPhysicsAggregates = [];
    this.avatar = null;
    this.avatarController = null;
    this.thumbnailCamera = null;
    this.userSpawnPlane = null;

    this.scene.blockfreeActiveMeshesAndRenderingGroups = true;
    this.highlightLayer.dispose();
    this.scene.dispose();

    this.orbitGizmo.dispose();

    super.dispose();
  }
}

export type AdlerStudioEngineType = InstanceType<typeof AdlerStudioEngine>;
