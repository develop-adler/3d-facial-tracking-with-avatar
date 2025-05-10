// import "@babylonjs/core/Animations/animatable";
import "@babylonjs/core/Engines/Extensions/engine.query"; // for occlusion queries
import "@babylonjs/core/Rendering/boundingBoxRenderer"; // for occlusion queries
// import '@babylonjs/core/Meshes/thinInstanceMesh'; // for PhysicsViewer
// import { Animation } from "@babylonjs/core/Animations/animation";
import { BoneIKController } from "@babylonjs/core/Bones/boneIKController";
import { BoneLookController } from "@babylonjs/core/Bones/boneLookController";
// import { PhysicsViewer } from '@babylonjs/core/Debug/physicsViewer';
import {
  loadAssetContainerAsync,
  importAnimationsAsync,
} from "@babylonjs/core/Loading/sceneLoader";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import {
  PhysicsShapeBox,
  PhysicsShapeCapsule,
  PhysicsShapeContainer,
  PhysicsShapeSphere,
} from "@babylonjs/core/Physics/v2/physicsShape";
import type { Participant } from "livekit-client";

import type AvatarProfile from "@/3d/avatar/AvatarProfile";
import type AvatarProfileCard from "@/3d/avatar/AvatarProfileCard";
import AvatarInteraction from "@/3d/avatar/AvatarInteraction";
import AvatarVoiceBubble from "@/3d/avatar/AvatarVoiceBubble";
import type CoreScene from "@/3d/core/CoreScene";
import eventBus from "@/eventBus";
import type {
  AvatarGender,
  AvatarInteractionType,
  AvatarPhysicsShapes,
  ObjectQuaternion,
  ObjectTransform,
} from "@/models/3d";
import type { AvatarChange } from "@/models/multiplayer";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useAvatarLoadingStore } from "@/stores/useAvatarLoadingStore";
import CreateAvatarPhysicsShape from "@/utils/CreateAvatarPhysicsShape";
import { waitForConditionAndExecute } from "@/utils/functionUtils";
import { isValidRPMAvatarId } from "@/utils/utilities";

import { clientSettings } from "clientSettings";
import {
  AVATAR_PARAMS,
  PHYSICS_MOTION_TYPE,
  PHYSICS_SHAPE_FILTER_GROUPS,
} from "constant";

import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Bone } from "@babylonjs/core/Bones/bone";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";

type AnimationsRecord = Record<string, AnimationGroup>;

type HandBoneIKControllers = {
  left?: BoneIKController;
  right?: BoneIKController;
};

export const AVATAR_ANIMATIONS = [
  "Idle",
  "Walk",
  "Run",
  "Jump",
  "Crouch",
  "CrouchWalk",
  "Wave",
  "HipHopDance",
  "Bow",
  "Clap",
  "Cry",
  "Kick",
  "Punch",
  "ChestFlinch",
  "HeadFlinch",
  "SitLoop",
  "IdleToSit",
  "SitToIdle",
];

const RPM_AVATAR_PARAMS = `
    morphTargets=
        browDownLeft,browDownRight,browInnerUp,browOuterUpLeft,browOuterUpRight,
        cheekPuff,cheekSquintLeft,cheekSquintRight,
        eyeBlinkLeft,eyeBlinkRight,
        eyeLookDownLeft,eyeLookDownRight,eyeLookInLeft,eyeLookInRight,eyeLookOutLeft,
        eyeLookOutRight,eyeLookUpLeft,eyeLookUpRight,
        eyeSquintLeft,eyeSquintRight,eyeWideLeft,eyeWideRight,
        jawForward,jawLeft,jawOpen,jawRight,
        mouthClose,
        mouthDimpleLeft,mouthDimpleRight,
        mouthFrownLeft,mouthFrownRight,
        mouthFunnel,mouthLeft,mouthRight,mouthLowerDownLeft,mouthLowerDownRight,
        mouthPressLeft,mouthPressRight,mouthPucker,mouthRollLower,mouthRollUpper,
        mouthShrugLower,mouthShrugUpper,mouthSmileLeft,mouthSmileRight,
        mouthStretchLeft,mouthStretchRight,mouthUpperUpLeft,mouthUpperUpRight,
        noseSneerLeft,
        noseSneerRight
    &useDracoMeshCompression=true
    &useQuantizeMeshOptCompression=true
    &textureAtlas=1024
    &textureFormat=webp
`.replaceAll(/\s+/g, "");

const DEFAULT_AVATAR_ID = "67fe6f7713b3fb7e8aa0328c";

class Avatar {
  readonly coreScene: CoreScene;
  readonly scene: Scene;
  readonly participant: Participant;
  gender: AvatarGender;
  readonly isSelf: boolean;
  readonly headHeight: number = AVATAR_PARAMS.CAMERA_HEAD_HEIGHT_MALE;
  readonly avatarPhysicsShapes: AvatarPhysicsShapes;

  private _voiceBubble?: AvatarVoiceBubble;
  private _profile?: AvatarProfile;
  private _multiplayProfile?: AvatarProfileCard;
  private _isCreatingProfileCard: boolean = false;
  private _clickedToOpenProfileCard: boolean = false;

  readonly root: TransformNode;
  private _container?: AssetContainer;
  private _bones?: Bone[];
  private _morphTargetManager?: MorphTargetManager;
  private _rootMesh?: AbstractMesh;
  private _meshes: Array<AbstractMesh> = [];
  private _skeleton?: Skeleton;
  private _animations: Record<string, AnimationGroup> = {};
  private _boneLookController?: BoneLookController;
  currentBoneLookControllerTarget?: Vector3;
  dontSyncHeadWithUser: boolean = false;

  readonly boneIKTargets: {
    left: {
      pole: TransformNode;
      target: TransformNode;
    };
    right: {
      pole: TransformNode;
      target: TransformNode;
    };
  };
  private _boneIKControllers: HandBoneIKControllers;

  avatarBodyShapeFull?: PhysicsShapeContainer;
  avatarBodyShapeCrouch?: PhysicsShapeSphere;
  private _capsuleBody?: PhysicsBody;
  private _capsuleBodyNode?: TransformNode;
  private _physicsSyncingObservers: Array<Observer<Scene>> = [];
  private _hitBoxBodies: Array<PhysicsBody> = [];
  private _physicsBodies: Array<PhysicsBody> = [];

  // for teleportation shape cast checking
  avatarBodyShapeFullForChecks?: PhysicsShapeContainer;

  private _height: number = 0;
  private _capsuleCopyObserver?: Observer<Scene>;

  // for physics debugging
  // private readonly physicsViewer: PhysicsViewer;

  currentAvatarId: string = "";
  isLoadingAvatar: boolean = false;
  playingAnimation?: AnimationGroup;
  isPlayingAnimationLooping: boolean = true;
  isMoving: boolean = false;
  isRunning: boolean = false;
  isGrounded: boolean = false;
  isCrouching: boolean = false;
  isFalling: boolean = false;
  isControlledByAnotherSession: boolean = false;
  isInteractionByAnotherSession: boolean = false;
  isControlledByUser: boolean = false;
  private _isCameraMoved: boolean = false;
  private _isPointerUpEnabled: boolean = true;
  private _pointerUpCooldown?: globalThis.NodeJS.Timeout;

  avatarScenePickObserver?: Observer<PointerInfo>;
  private _fallSceneObserver?: Observer<Scene>;
  private _isCapsuleBodyColliding: boolean = false;
  private avatarFallTimeout?: globalThis.NodeJS.Timeout;
  avatarFallTimeoutTimer: number = 3500;
  avatarFallTimeoutCallback?: (avatar: this) => void;

  interaction?: AvatarInteraction;
  isAnimationsReady: boolean = false;
  isReady: boolean = false;

  constructor(
    coreScene: CoreScene,
    participant: Participant,
    gender: AvatarGender,
    isSelf: boolean = false,
    physicsShapes?: {
      normal: PhysicsShapeCapsule;
      crouch: PhysicsShapeCapsule;
    },
    position?: Vector3 | ObjectTransform,
    rotation?: Quaternion | ObjectQuaternion
  ) {
    this.coreScene = coreScene;
    this.scene = coreScene.scene;
    this.gender = gender;
    this.participant = participant;
    this.isSelf = isSelf;
    this.avatarPhysicsShapes = {
      male: {},
      female: {},
      other: {},
    };

    if (this.gender === "female")
      this.headHeight = AVATAR_PARAMS.CAMERA_HEAD_HEIGHT_FEMALE;

    this._preloadAnimationResources();

    const tNodeName = "avatarRootNode_" + participant.identity;
    this.root = new TransformNode(tNodeName, this.scene);

    if (position) {
      if (position instanceof Vector3) this.root.position = position.clone();
      else if (Array.isArray(position))
        this.root.position = Vector3.FromArray(position);
    }
    if (rotation) {
      if (rotation instanceof Quaternion)
        this.root.rotationQuaternion = rotation.clone();
      else if (Array.isArray(rotation))
        this.root.rotationQuaternion = Quaternion.FromArray(rotation);
    }

    this._boneIKControllers = {};
    this.boneIKTargets = {
      left: {
        pole: new TransformNode("leftHandPoleTarget", this.scene),
        target: new TransformNode("leftHandTarget", this.scene),
      },
      right: {
        pole: new TransformNode("rightHandPoleTarget", this.scene),
        target: new TransformNode("rightHandTarget", this.scene),
      },
    };

    // for physics debugging
    // this.physicsViewer = new PhysicsViewer(scene);
  }

  // get highlightLayer(): HighlightLayer | undefined {
  //   return this.post?.atom3DObjects?.highlightLayer;
  // }
  get container(): AssetContainer | undefined {
    return this._container;
  }
  get morphTargetManager(): MorphTargetManager | undefined {
    return this._morphTargetManager;
  }
  get meshes(): Array<AbstractMesh> {
    return this._meshes;
  }
  get skeleton(): Skeleton | undefined {
    return this._skeleton;
  }
  get bones(): Bone[] | undefined {
    return this._bones;
  }
  get animations(): AnimationsRecord {
    return this._animations;
  }
  get boneLookController(): BoneLookController | undefined {
    return this._boneLookController;
  }
  get boneIKControllers(): HandBoneIKControllers {
    return this._boneIKControllers;
  }

  get capsuleBody(): PhysicsBody | undefined {
    return this._capsuleBody;
  }
  get physicsBodies(): Array<PhysicsBody> {
    return this._physicsBodies;
  }
  get voiceBubble(): AvatarVoiceBubble | undefined {
    return this._voiceBubble;
  }
  get profile(): AvatarProfile | undefined {
    return this._profile;
  }
  get height(): number {
    return this._height;
  }
  get isCapsuleBodyColliding(): boolean {
    return this._isCapsuleBodyColliding;
  }

  /**
   * Load avatar from avatar id
   */
  async loadAvatar(
    id: string = useAvatarStore.getState().avatarId ?? DEFAULT_AVATAR_ID,
    gender: AvatarGender = "male",
    isVideoChat: boolean = false,
    emitChangeEvent: boolean = false
  ): Promise<this> {
    if (this.isLoadingAvatar || this.currentAvatarId === id) return this;

    this.gender = gender;

    this.scene.blockMaterialDirtyMechanism = true;

    this.isLoadingAvatar = true;
    useAvatarLoadingStore.getState().setStartLoading();

    if (emitChangeEvent) {
      eventBus.emit<AvatarChange>("avatar:changeAvatar", {
        identity: this.participant.identity,
        avatarId: id,
        gender: "female",
      });
    }

    const container = await loadAssetContainerAsync(
      `https://models.readyplayer.me/${id}.glb?` + RPM_AVATAR_PARAMS,
      this.scene,
      {
        pluginExtension: ".glb",
        pluginOptions: {
          gltf: {
            compileMaterials: true,
          },
        },
        onProgress: (progress) => {
          const percentage = Math.floor(
            (progress.loaded / progress.total) * 100
          );
          useAvatarLoadingStore.getState().setLoadingPercentage(percentage);
        },
      }
    );

    // remove existing avatar model
    if (this._container) {
      if (this._rootMesh) {
        // eslint-disable-next-line unicorn/no-null
        this._rootMesh.parent = null; // remove root mesh parent
        // remove all children from root mesh
        for (const child of this._rootMesh.getChildren()) {
          // eslint-disable-next-line unicorn/no-null
          child.parent = null;
        }
      }
      this._rootMesh = undefined;
      this._meshes = [];
      this._skeleton = undefined;
      this._bones = undefined;
      this._morphTargetManager = undefined;
      this._container.dispose();
    }

    this._container = container;
    useAvatarLoadingStore.getState().setNotLoading();
    container.addAllToScene();

    this.currentAvatarId = id;
    useAvatarStore.getState().setAvatarId(id);

    this._rootMesh = container.meshes[0];
    this._meshes = container.meshes.slice(1);
    this._skeleton = container.skeletons[0];
    this._bones = container.skeletons[0].bones;

    if (container.morphTargetManagers.length > 0) {
      this._morphTargetManager = container.morphTargetManagers[0];
    }

    if (emitChangeEvent) this.loadAnimations();

    container.meshes.forEach((mesh, i) => {
      // is root mesh, skip
      if (i === 0) {
        mesh.parent = this.root; // assign root as parent
        mesh.isPickable = false;
        mesh.layerMask = Math.trunc(1); // visible on layer 1
        return;
      }

      // this._handleMorpTargets(mesh);

      const meshYPosition = mesh.getBoundingInfo().boundingBox.maximumWorld.y;
      if (meshYPosition > this._height) this._height = meshYPosition;

      mesh.receiveShadows = true;
      mesh.material?.freeze();
      mesh.isPickable = true;
      mesh.layerMask = Math.trunc(1); // visible on layer 1

      // skip frustum culling check if is own avatar
      if (this.participant && this.isSelf) {
        mesh.alwaysSelectAsActiveMesh = true;
      } else {
        mesh.renderingGroupId = 1;
        mesh.occlusionType = 1; //AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
        mesh.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
        mesh.isOccluded = false; // don't make object occluded by default
      }
    });

    this.isLoadingAvatar = false;
    eventBus.emit(`avatar:modelLoaded:${this.participant.identity}`, container);

    if (!this._voiceBubble) {
      this._voiceBubble = new AvatarVoiceBubble(this);
    }

    // change head node parent and camera target
    const headNode = this.scene.getTransformNodeByName(
      `customHeadNode_${this.participant.identity}`
    );
    if (headNode) headNode.parent = this.root;

    // if (this.post) {
    //   const pickingList = [...this.post.gpuPickerPickingList, ...this._meshes.map(mesh => mesh.getChildMeshes()).flat()];
    //   console.log('GPU picker picking list:', pickingList);
    //   this.post.gpuPickerPickingList = pickingList;
    //   this.post.gpuPicker.setPickingList(this.post.gpuPickerPickingList);
    // }

    // // for debugging occlusion and frustum culling
    // this.scene.onBeforeRenderObservable.add(() => {
    //   if (!this._rootMesh) return;
    //   if (this._rootMesh.getChildMeshes().every(mesh => mesh.isOccluded === true)) {
    //     console.log(`avatar ${this.participant.identity} is occluded`);
    //   }
    // });

    this.scene.blockMaterialDirtyMechanism = false;

    const headBone = this._skeleton.bones.find((bone) =>
      bone.name.includes("Head")
    );
    const headBoneTNode = headBone?.getTransformNode();

    if (headBone && headBoneTNode) {
      this._boneLookController = new BoneLookController(
        headBoneTNode,
        headBone,
        Vector3.ZeroReadOnly,
        {
          upAxis: Vector3.DownReadOnly,
          yawAxis: Vector3.UpReadOnly,
          pitchAxis: Vector3.RightReadOnly,

          // don't allow turning head past shoulders
          minYaw: -Math.PI * 0.4, // left rotation
          maxYaw: Math.PI * 0.4, // right rotation

          // don't allow turning all the way up or down
          minPitch: -Math.PI * 0.4, // down rotation
          maxPitch: Math.PI * 0.4, // max rotation

          slerpAmount: 0.2,
        }
      );
    }

    // if (this.isAnimationsReady === true) {
    //   this.isReady = true;
    //   eventBus.emit(`avatar:ready:${this.participant.identity}`, this);
    // } else {
    //   eventBus.once(`avatar:animationsReady:${this.participant.identity}`, () => {
    //     this.isReady = true;
    //     eventBus.emit(`avatar:ready:${this.participant.identity}`, this);
    //   });
    // }

    // update camera position and target to face the avatar's eyes
    if (isVideoChat) {
      const leftEyeTNode = this._skeleton.bones
        .find((bone) => bone.name === "LeftEye")
        ?.getTransformNode();
      const rightEyeTNode = this._skeleton.bones
        .find((bone) => bone.name === "RightEye")
        ?.getTransformNode();

      if (leftEyeTNode && rightEyeTNode) {
        const pointBetweenEyes = new Vector3(
          (leftEyeTNode.absolutePosition.x + rightEyeTNode.absolutePosition.x) /
          2,
          (leftEyeTNode.absolutePosition.y + rightEyeTNode.absolutePosition.y) /
          2,
          (leftEyeTNode.absolutePosition.z + rightEyeTNode.absolutePosition.z) /
          2
        );

        this.coreScene.camera.setPosition(pointBetweenEyes);
        this.coreScene.camera.setTarget(pointBetweenEyes);
      }

      // parent pole target meshes to avatar mesh so that it
      // moves relative to the avatar
      this.boneIKTargets.left.target.parent = container.meshes[0];
      this.boneIKTargets.right.target.parent = container.meshes[0];
      this.boneIKTargets.left.pole.parent = container.meshes[0];
      this.boneIKTargets.right.pole.parent = container.meshes[0];

      const bones = container.skeletons[0].bones;

      this._boneIKControllers.left = new BoneIKController(
        container.meshes[0],
        bones.find((bone) => bone.name === "LeftHand")!,
        {
          targetMesh: this.boneIKTargets.left.target,
          // poleTargetBone: bones.find(bone => bone.name === "LeftShoulder"), // orient bending based on this bone
          // poleTargetMesh: this.boneIKTargets.left.pole,
          // poleAngle: 0,
          // bendAxis: Vector3.Right(),      // usually 'Right' for arms
          slerpAmount: 0.3,
        }
      );
      this._boneIKControllers.right = new BoneIKController(
        container.meshes[0],
        bones.find((bone) => bone.name === "RightHand")!,
        {
          targetMesh: this.boneIKTargets.right.target,
          poleTargetBone: bones.find((bone) => bone.name === "RightForeArm"), // orient bending based on this bone
          poleTargetMesh: this.boneIKTargets.right.pole,
          // poleAngle: 0,
          // bendAxis: Vector3.Right(),      // usually 'Right' for arms
          slerpAmount: 0.3,
        }
      );

      // this.boneIKUpdateObserver = this.scene.onBeforeRenderObservable.add(() => {
      //     this._boneIKControllers.left?.update();
      //     this._boneIKControllers.right?.update();
      // });
    }

    // this._rootMesh.getChildMeshes().forEach(mesh => {
    //   if (this.highlightLayer) {
    //     this.highlightLayer.removeMesh(mesh as Mesh);
    //     this.highlightLayer.addExcludedMesh(mesh as Mesh);
    //   }
    // });

    // only enable click-to-open-profile-card event for other avatars
    if (!this.isSelf) {
      let start = 0;
      this.avatarScenePickObserver = this.scene.onPointerObservable.add(
        async (pointerInfo) => {
          if (!this.scene.activeCamera) return;

          // register left click only
          if (pointerInfo.event.button !== 0) return;

          this.scene.activeCamera.onViewMatrixChangedObservable.add(() => {
            this._isCameraMoved = true;
          });

          switch (pointerInfo.event.type) {
            case "mousedown":
            case "pointerdown": {
              this._isCameraMoved = false;
              start = performance.now();
              break;
            }
            case "mouseup":
            case "pointerup": {
              // don't pick mesh if mousedown is held for more than 300ms
              if (performance.now() - start > 300) break;

              if (this._isCameraMoved === true) break;

              // prevent duplicate multiple pointer up event from being fired with timeout
              if (!this._isPointerUpEnabled) break;

              this._isPointerUpEnabled = false;
              if (this._pointerUpCooldown)
                clearTimeout(this._pointerUpCooldown);
              this._pointerUpCooldown = setTimeout(() => {
                this._isPointerUpEnabled = true;
              }, (1000 / 60) * 2);

              // if (this.post.gpuPicker.pickingInProgress) break;

              // const pickInfo = await this.post.gpuPicker.pickAsync(
              //   pointerInfo.event.clientX,
              //   pointerInfo.event.clientY
              // );

              // console.log(this.post.gpuPickerPickingList);
              // console.log('Avatar scene pick:', pickInfo);

              const pickInfo = this.scene.pick(
                pointerInfo.event.clientX,
                pointerInfo.event.clientY
              );
              if (pickInfo.hit && pickInfo.pickedMesh) {
                const mesh = pickInfo.pickedMesh;
                if (mesh && this._meshes.includes(mesh)) {
                  this._multiplayProfile?.show();
                } else if (mesh !== this._multiplayProfile?.htmlMesh) {
                  this._multiplayProfile?.hide();
                }
                return;
              }

              const physicsEngine = this.scene.getPhysicsEngine();

              if (!physicsEngine || !pickInfo.ray) return;

              const result = physicsEngine.raycast(
                pickInfo.ray.origin,
                pickInfo.ray.origin.add(
                  pickInfo.ray.direction.scaleInPlace(20)
                ),
                {
                  collideWith: PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF,
                }
              );

              if (
                result.hasHit &&
                result.body &&
                this._hitBoxBodies.includes(result.body)
              ) {
                if (this._multiplayProfile) {
                  this._multiplayProfile.show();
                } else if (!this._isCreatingProfileCard && !this.isSelf) {
                  import("@/3d/avatar/AvatarProfileCard").then(
                    ({ default: AvatarProfileCard }) => {
                      this._multiplayProfile = new AvatarProfileCard(
                        this,
                        this.participant
                      );
                      this._multiplayProfile?.show(undefined, false);
                    }
                  );
                } else if (
                  this._isCreatingProfileCard &&
                  this._clickedToOpenProfileCard
                ) {
                  waitForConditionAndExecute(
                    () => !!this._multiplayProfile,
                    () => {
                      this._multiplayProfile?.show();
                    },
                    undefined,
                    undefined,
                    5000
                  );
                }
                this._clickedToOpenProfileCard = true;
              } else {
                this._multiplayProfile?.hide();
              }
              break;
            }
          }
        }
      );
    }

    // progressive LOD loading, commented out due to having issues with animations
    // (async () => {
    //   for await (const lod of lods.slice(1)) {
    //     let lodResults: ISceneLoaderAsyncResult;
    //     try {
    //       lodResults = await SceneLoader.ImportMeshAsync(
    //         '',
    //         lod,
    //         '',
    //         this.scene,
    //         undefined,
    //         '.glb'
    //       );
    //     } catch (e) {
    //       console.error('Error loading avatar model:', e);
    //       continue;
    //     }

    //     this.avatarUrl = lod;

    //     this._retargetAnimations(lodResults.skeletons[0]);
    //     this._processMeshes(lodResults.meshes);

    //     if (!lod.includes('high')) {
    //       if (this._rootMesh) {
    //         this.scene.removeMesh(this._rootMesh, true);

    //         this._meshes.forEach(mesh => {
    //           this.scene.removeMesh(mesh, true);
    //         });
    //       }
    //     } else {
    //       this._rootMesh?.dispose(false, true);
    //       this._meshes.forEach(mesh => mesh.dispose(false, true));
    //     }

    //     this._rootMesh = lodResults.meshes[0];
    //     this._meshes = lodResults.meshes.slice(1);
    //     this._skeleton = lodResults.skeletons[0];
    //   }
    // })();

    return this;
  }

  async changeAvatar(url: string) {
    if (this.isLoadingAvatar) {
      let interval: globalThis.NodeJS.Timeout;
      await new Promise<void>((resolve) => {
        interval = setInterval(() => {
          if (!this.isLoadingAvatar) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    }

    // extract id from url
    const id = url.split("/").pop()?.split(".")[0];
    if (!id || !isValidRPMAvatarId(id)) {
      globalThis.alert("Invalid avatar URL");
      return;
    }
    if (this.currentAvatarId === id) return;
    return this.loadAvatar(id, undefined, undefined, true);
  }

  // private _handleMorpTargets(mesh: AbstractMesh): void {
  //   // for eye blinking animation
  //   if (!mesh.morphTargetManager) return;

  //   for (let i = 0; i < mesh.morphTargetManager.numTargets; i++) {
  //     const morphTarget = mesh.morphTargetManager.getTarget(i);

  //     const morphAnim = new Animation(
  //       morphTarget.name + "_anim",
  //       "influence",
  //       60,
  //       Animation.ANIMATIONTYPE_FLOAT,
  //       Animation.ANIMATIONLOOPMODE_CYCLE
  //     );

  //     const length = 8 * 60;

  //     // blinking takes 11 frames, lids closed for 3 frames
  //     // and can't have same value in 2 consecutive frames
  //     morphAnim.setKeys([
  //       {
  //         frame: 0,
  //         value: 0.0,
  //       },
  //       {
  //         frame: 10,
  //         value: 0.001,
  //       },
  //       {
  //         frame: 15,
  //         value: 0.999,
  //       },
  //       {
  //         frame: 18,
  //         value: 0.998,
  //       },
  //       {
  //         frame: 21,
  //         value: 0.001,
  //       },
  //       {
  //         frame: length,
  //         value: 0.00001,
  //       },
  //     ]);
  //     morphTarget.animations.push(morphAnim);
  //     this.scene.beginAnimation(
  //       morphTarget,
  //       0,
  //       length,
  //       true,
  //       1,
  //       undefined,
  //       undefined,
  //       undefined,
  //       undefined,
  //       undefined,
  //       true
  //     );
  //   }
  // }

  // private _retargetAnimations(skeleton: Skeleton) {
  //   Object.values(this._animations).forEach(anim => {
  //     // find matching bone name in new skeleton to animatable
  //     // target in original animation then assign bone from original skeleton
  //     for (const clip of anim.targetedAnimations) {
  //       if (!clip.target) continue;
  //       const boneindex = skeleton.getBoneIndexByName(clip.target.name);
  //       clip.target = skeleton.bones[boneindex].getTransformNode();
  //     }
  //   });

  //   setTimeout(() => {
  //     if (this.playingAnimation) {
  //       const currentAnim = this.playingAnimation;
  //       this.playingAnimation.stop(true);
  //       this.playingAnimation = null;
  //       this.playAnimation(currentAnim, true);
  //     }
  //   }, 1000 / 60);
  // }

  private async _preloadAnimationResources() {
    // eslint-disable-next-line unicorn/no-array-for-each
    AVATAR_ANIMATIONS.forEach(async (animName) => {
      const name =
        this.gender === "male"
          ? `Male${animName}.glb`
          : `Female${animName}.glb`;
      const url = "/static/avatar/animations/" + name;
      fetch(url);
    });
  }

  /**
   * Load avatar animations, MUST be loaded after avatar model is loaded
   */
  async loadAnimations() {
    if (!this._skeleton) {
      console.error('No avatar skeleton found, load animation failed');
      return;
    }

    const skeleton = this._skeleton;

    // remove all existing animations
    for (const anim of Object.values(this._animations)) {
      anim.stop(true);
      anim.dispose();
    }
    this._animations = {};

    // import animations and retarget to this skeleton
    await Promise.all(
      // resources.map(async ({ url }) => {
      AVATAR_ANIMATIONS.map(async (animName) => {
        const fileName =
          this.gender === "male"
            ? `Male${animName}.glb`
            : `Female${animName}.glb`;
        const url = "/static/avatar/animations/" + fileName;

        await importAnimationsAsync(url, this.scene, {
          pluginExtension: ".glb",
          overwriteAnimations: false,
          animationGroupLoadingMode: 3, // SceneLoaderAnimationGroupLoadingMode.NOSYNC
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          targetConverter: (target: any) => {
            // get bone index of this avatar's skeleton from target name
            const boneIndex = skeleton.getBoneIndexByName(target.name);

            // return null if not found
            // eslint-disable-next-line unicorn/no-null
            if (boneIndex === -1) return null;

            // retarget animation to this avatar's skeleton
            return skeleton.bones[boneIndex].getTransformNode();
          },
          pluginOptions: {
            gltf: {
              animationStartMode: 0, // GLTFLoaderAnimationStartMode.NONE
            },
          },
        });

        const importedAnimation = this.scene.animationGroups.at(-1);

        if (!importedAnimation) return;

        // stop animation to prevent it from playing and loop infinitely
        for (const ta of importedAnimation.targetedAnimations) {
          this.scene.stopAnimation(ta.target);
        }
        // importedAnimation.stop(true); // for some reason this doesn't work at all

        importedAnimation.enableBlending = true;
        importedAnimation.blendingSpeed = 0.05;

        // rename animation to have user's id
        importedAnimation.name = `${animName}_${this.participant.identity}`;

        this._animations[importedAnimation.name] = importedAnimation;

        // remove head bone from all animations (this will allow head to be synced with user)
        // importedAnimation.targetedAnimations.splice(
        //   importedAnimation.targetedAnimations.findIndex(
        //     (ta) => ta.target.name === "Head"
        //   ),
        //   1
        // );
        for (const ta of importedAnimation.targetedAnimations) {
          if (ta.target.name === "Head") {
            importedAnimation.targetedAnimations.splice(
              importedAnimation.targetedAnimations.indexOf(ta),
              1
            );
          }
        }
      })
    );

    console.log('Avatar animations loaded:', this._animations);

    this.playingAnimation = undefined;
    this.isAnimationsReady = true;
    eventBus.emit(`avatar:animationsReady:${this.participant.identity}`, this);
  }

  loadPhysicsBodies(skeleton?: Skeleton): void {
    // load hitboxes for skeleton
    if (skeleton) this._generateHitBoxes(skeleton);

    // capsule body always has to be generated after the physics bodies
    // otherwise the physics bodies' position will not be correct
    this._capsuleBody = this._generateCapsuleBody(this.root.absolutePosition);

    this._createGroundCheckBody();

    if (clientSettings.DEBUG) {
      console.log(
        `Physics bodies created for ${this.participant.identity}:`,
        this._physicsBodies.map((body) => body.transformNode.name)
      );
    }
  }

  private _generateCapsuleBody(position?: Vector3): PhysicsBody {
    const avatarPhysicsShapes = this.isSelf
      ? this.avatarPhysicsShapes
      : this.coreScene.remoteAvatarPhysicsShapes;

    avatarPhysicsShapes[this.gender].normal ??= CreateAvatarPhysicsShape(
      this.scene,
      this.gender,
      false,
      !this.isSelf
    );

    avatarPhysicsShapes[this.gender].crouch ??= CreateAvatarPhysicsShape(
      this.scene,
      this.gender,
      true,
      !this.isSelf
    );

    this.avatarBodyShapeFull = avatarPhysicsShapes[this.gender].normal!;
    this.avatarBodyShapeCrouch = avatarPhysicsShapes[this.gender].crouch!;

    if (!this.avatarBodyShapeFullForChecks) {
      this.avatarBodyShapeFullForChecks = CreateAvatarPhysicsShape(
        this.scene,
        this.gender,
        false,
        !this.isSelf
      );
      this.avatarBodyShapeFullForChecks.filterCollideMask =
        PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;
    }

    const capsuleHeight =
      this.gender === "male"
        ? AVATAR_PARAMS.CAPSULE_HEIGHT_MALE
        : AVATAR_PARAMS.CAPSULE_HEIGHT_FEMALE;

    if (!this._capsuleBodyNode) {
      this._capsuleBodyNode = new TransformNode(
        "avatarCapsuleBodyNode_" + this.participant.identity,
        this.scene
      );
    }
    this._capsuleBodyNode.setAbsolutePosition(position ?? Vector3.Zero());

    const body = new PhysicsBody(
      this._capsuleBodyNode,
      this.isSelf ? PHYSICS_MOTION_TYPE.DYNAMIC : PHYSICS_MOTION_TYPE.ANIMATED,
      true,
      this.scene
    );
    body.shape = this.avatarBodyShapeFull;

    body.setMassProperties({
      centerOfMass: new Vector3(0, capsuleHeight * 0.5, 0),
      mass: this.gender === "male" ? 65 : 45,
      inertia: Vector3.Zero(),
    });
    body.setCollisionCallbackEnabled(true);
    body.setCollisionEndedCallbackEnabled(true);

    body.getCollisionObservable().add((collisionEvent) => {
      switch (collisionEvent.type) {
        case "COLLISION_STARTED":
        case "COLLISION_CONTINUED": {
          this._isCapsuleBodyColliding = true;
          break;
        }
      }
    });
    body.getCollisionEndedObservable().add(() => {
      this._isCapsuleBodyColliding = false;
    });

    this._physicsBodies.push(body);

    this._capsuleCopyObserver?.remove();
    this._capsuleCopyObserver = this.scene.onAfterPhysicsObservable.add(() => {
      if (!this._capsuleBodyNode) return;
      this.root.setAbsolutePosition(this._capsuleBodyNode.absolutePosition);
    });

    eventBus.emit(`avatar:capsuleBodyCreated:${this.participant.identity}`, body);

    this._fallSceneObserver = this.scene.onAfterPhysicsObservable.add(() => {
      // if is falling and capsule body isn't colliding with anything
      // start timeout to check if avatar is falling infinitely in the air
      if (this.isFalling === true && this._isCapsuleBodyColliding === false) {
        if (!this.avatarFallTimeout) {
          this.avatarFallTimeout = setTimeout(() => {
            this.avatarFallTimeoutCallback?.(this);
          }, this.avatarFallTimeoutTimer);
        }
      } else {
        // clear timeout if avatar is not falling or is colliding with something
        if (this.avatarFallTimeout) {
          clearTimeout(this.avatarFallTimeout);
          this.avatarFallTimeout = undefined;
        }
      }
    });

    // for physics debugging
    // this.physicsViewer.showBody(body);

    return body;
  }

  setFallTimeoutTimer(timer: number) {
    this.avatarFallTimeoutTimer = timer;
  }

  setFallTimeoutCallback(callback: (avatar: Avatar) => void) {
    this.avatarFallTimeoutCallback = callback;
  }

  private _generateHitBoxes(skeleton: Skeleton): void {
    const createSphereBody = (
      bone?: Bone,
      diameter: number = 0.07,
      positionOffset: Vector3 = Vector3.Zero()
    ) => {
      if (!bone) return;

      const bodyNode = new TransformNode(
        bone.name + "_node_" + this.participant.identity,
        this.scene
      );
      bodyNode.position = bone.getAbsolutePosition(this._rootMesh);

      const sphereShape = new PhysicsShapeSphere(
        positionOffset,
        diameter,
        this.scene
      );
      sphereShape.material = { friction: 0, restitution: 0 };

      // collide with other bodies and allow other bodies to collide with self bodies
      sphereShape.filterMembershipMask =
        PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;
      sphereShape.filterCollideMask =
        PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;

      const body = new PhysicsBody(
        bodyNode,
        PHYSICS_MOTION_TYPE.DYNAMIC,
        false,
        this.scene
      );
      body.shape = sphereShape;
      body.setMassProperties({
        centerOfMass: bodyNode.position,
        mass: 150,
        inertia: Vector3.Zero(),
      });

      // update position of physics bodies every frame
      const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
      if (plugin) {
        this._physicsSyncingObservers.push(
          this.scene.onAfterPhysicsObservable.add(() => {
            (plugin as HavokPlugin)._hknp.HP_Body_SetPosition(
              body._pluginData.hpBodyId,
              bone.getAbsolutePosition(this._rootMesh).asArray()
            );
          })
        );
      }

      this._hitBoxBodies.push(body);
      this._physicsBodies.push(body);
    };

    const createBoxBody = (
      bone: Bone | undefined,
      boxSize: Vector3,
      offset: Vector3 = Vector3.Zero()
    ) => {
      if (!bone) return;

      const bodyNode = new TransformNode(
        bone.name + "_node_" + this.participant.identity,
        this.scene
      );
      bodyNode.position = bone.getAbsolutePosition(this._rootMesh);

      const boxShape = new PhysicsShapeBox(
        offset,
        Quaternion.Identity(),
        boxSize,
        this.scene
      );
      boxShape.material = { friction: 0, restitution: 0 };

      boxShape.filterMembershipMask =
        PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;
      boxShape.filterCollideMask =
        PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_BODIES_SELF;

      const body = new PhysicsBody(
        bodyNode,
        PHYSICS_MOTION_TYPE.DYNAMIC,
        false,
        this.scene
      );
      body.shape = boxShape;
      body.setMassProperties({
        centerOfMass: bodyNode.position,
        mass: 300,
        inertia: Vector3.Zero(),
      });

      body.setCollisionCallbackEnabled(true);

      switch (bone.name) {
        case "Head": {
          setTimeout(() => {
            body.getCollisionObservable().add((collision) => {
              if (collision.type === "COLLISION_STARTED") {
                if (
                  collision.collidedAgainst.transformNode.name.includes(
                    "LeftHandMiddle1"
                  ) ||
                  collision.collidedAgainst.transformNode.name.includes(
                    "RightHandMiddle1"
                  ) ||
                  collision.collidedAgainst.transformNode.name.includes(
                    "LeftToeBase"
                  ) ||
                  collision.collidedAgainst.transformNode.name.includes(
                    "RightToeBase"
                  )
                ) {
                  // TODO: handle flinching interaction better
                  // const identity = collision.collidedAgainst.transformNode.name
                  //   .split("_")
                  //   .at(-1);
                  // for (const avatar of this._otherAvatars) {
                  //   // if avatar is not already getting hit, play head flinch animation
                  //   if (
                  //     avatar.participant.identity === identity &&
                  //     avatar.interaction?.type === "hitting" &&
                  //     this.interaction?.type !== "gethit"
                  //   ) {
                  //     this.playInteraction("HeadFlinch", "gethit");
                  //     break;
                  //   }
                  // }
                }
              }
            });
          }, 8);
          break;
        }
        case "Hips":
        case "Spine1":
        case "Spine2": {
          setTimeout(() => {
            body.getCollisionObservable().add((collision) => {
              if (collision.type === "COLLISION_STARTED") {
                if (
                  collision.collidedAgainst.transformNode.name.includes(
                    "LeftHandMiddle1"
                  ) ||
                  collision.collidedAgainst.transformNode.name.includes(
                    "RightHandMiddle1"
                  ) ||
                  collision.collidedAgainst.transformNode.name.includes(
                    "LeftToeBase"
                  ) ||
                  collision.collidedAgainst.transformNode.name.includes(
                    "RightToeBase"
                  )
                ) {
                  // TODO: handle flinching interaction better
                  // const identity = collision.collidedAgainst.transformNode.name
                  //   .split("_")
                  //   .at(-1);
                  // for (const avatar of this._otherAvatars) {
                  //   // if avatar is not already getting hit, play chest flinch animation
                  //   // and prevent having another flinch if already getting hit
                  //   if (
                  //     avatar.participant.name === identity &&
                  //     avatar.interaction?.type === "hitting" &&
                  //     this.interaction?.type !== "gethit"
                  //   ) {
                  //     this.playInteraction("ChestFlinch", "gethit");
                  //     break;
                  //   }
                  // }
                }
              }
            });
          }, 8);
          break;
        }
      }

      // update position of physics bodies every frame
      const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
      if (plugin) {
        this._physicsSyncingObservers.push(
          this.scene.onAfterPhysicsObservable.add(() => {
            (plugin as HavokPlugin)._hknp.HP_Body_SetPosition(
              body._pluginData.hpBodyId,
              bone.getAbsolutePosition(this._rootMesh).asArray()
            );
            (plugin as HavokPlugin)._hknp.HP_Body_SetOrientation(
              body._pluginData.hpBodyId,
              bone.getRotationQuaternion(1, this._rootMesh).asArray()
            );
          })
        );
      }

      this._hitBoxBodies.push(body);
      this._physicsBodies.push(body);

      return body;
    };

    const getBoneFromName = (name: string): Bone | undefined => {
      return skeleton.bones.find((bone) => bone.name === name);
    };

    const BONE_BOX_BODY_PARAMS = {
      hips: {
        shape: "box",
        size: new Vector3(0.28, 0.28, 0.28),
        offset: new Vector3(0, 0.03, 0),
      },
      spine1: {
        shape: "box",
        size: new Vector3(0.26, 0.22, 0.26),
        offset: new Vector3(0, -0.03, 0),
      },
      spine2: {
        shape: "box",
        size: new Vector3(0.18, 0.18, 0.18),
        offset: new Vector3(0, -0.12, 0),
      },
      head: {
        shape: "sphere",
        size: 0.16,
        offset: new Vector3(0, 0.08, 0),
      },
      arm: {
        shape: "box",
        size: new Vector3(0.12, 0.28, 0.12),
        offset: new Vector3(0, -0.12, 0),
      },
      forearm: {
        shape: "box",
        size: new Vector3(0.12, 0.34, 0.12),
        offset: new Vector3(0, -0.12, 0),
      },
      hand: {
        shape: "sphere",
        size: 0.08,
        offset: Vector3.Zero(),
      },
      thigh: {
        shape: "box",
        size: new Vector3(0.12, 0.36, 0.12),
        offset: new Vector3(0, -0.24, 0),
      },
      calf: {
        shape: "box",
        size: new Vector3(0.12, 0.47, 0.12),
        offset: new Vector3(0, -0.2, 0),
      },
      foot: {
        shape: "box",
        size: new Vector3(0.12, 0.34, 0.16),
        offset: Vector3.Zero(),
      },
    };

    // create physics bodies for bones
    createBoxBody(
      getBoneFromName("Hips"),
      BONE_BOX_BODY_PARAMS.hips.size,
      BONE_BOX_BODY_PARAMS.hips.offset
    );

    createBoxBody(
      getBoneFromName("Spine1"),
      BONE_BOX_BODY_PARAMS.spine1.size,
      BONE_BOX_BODY_PARAMS.spine1.offset
    );
    createBoxBody(
      getBoneFromName("Spine2"),
      BONE_BOX_BODY_PARAMS.spine2.size,
      BONE_BOX_BODY_PARAMS.spine2.offset
    );
    createSphereBody(
      getBoneFromName("Head"),
      BONE_BOX_BODY_PARAMS.head.size,
      BONE_BOX_BODY_PARAMS.head.offset
    );

    createBoxBody(
      getBoneFromName("LeftArm"),
      BONE_BOX_BODY_PARAMS.arm.size,
      BONE_BOX_BODY_PARAMS.arm.offset
    );
    createBoxBody(
      getBoneFromName("RightArm"),
      BONE_BOX_BODY_PARAMS.arm.size,
      BONE_BOX_BODY_PARAMS.arm.offset
    );
    createBoxBody(
      getBoneFromName("LeftForeArm"),
      BONE_BOX_BODY_PARAMS.forearm.size,
      BONE_BOX_BODY_PARAMS.forearm.offset
    );
    createBoxBody(
      getBoneFromName("RightForeArm"),
      BONE_BOX_BODY_PARAMS.forearm.size,
      BONE_BOX_BODY_PARAMS.forearm.offset
    );
    createSphereBody(getBoneFromName("LeftHandMiddle1"));
    createSphereBody(getBoneFromName("RightHandMiddle1"));

    createBoxBody(
      getBoneFromName("LeftUpLeg"),
      BONE_BOX_BODY_PARAMS.thigh.size,
      BONE_BOX_BODY_PARAMS.thigh.offset
    );
    createBoxBody(
      getBoneFromName("RightUpLeg"),
      BONE_BOX_BODY_PARAMS.thigh.size,
      BONE_BOX_BODY_PARAMS.thigh.offset
    );
    createBoxBody(
      getBoneFromName("LeftLeg"),
      BONE_BOX_BODY_PARAMS.calf.size,
      BONE_BOX_BODY_PARAMS.calf.offset
    );
    createBoxBody(
      getBoneFromName("RightLeg"),
      BONE_BOX_BODY_PARAMS.calf.size,
      BONE_BOX_BODY_PARAMS.calf.offset
    );
    createBoxBody(
      getBoneFromName("LeftToeBase"),
      BONE_BOX_BODY_PARAMS.foot.size
    );
    createBoxBody(
      getBoneFromName("RightToeBase"),
      BONE_BOX_BODY_PARAMS.foot.size
    );

    // for physics debugging
    // this._physicsBodies.forEach(body => this.physicsViewer.showBody(body));
  }

  private _createGroundCheckBody(): void {
    const bodyNode = new TransformNode(
      "groundCheckBody_node_" + this.participant.identity,
      this.scene
    );
    bodyNode.setAbsolutePosition(this.root.getAbsolutePosition());

    const shape = new PhysicsShapeSphere(Vector3.Zero(), 0.1, this.scene);
    shape.material = { friction: 0, restitution: 0 };
    shape.filterMembershipMask =
      PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_GROUND_CHECK;
    shape.filterCollideMask = PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;

    const body = new PhysicsBody(
      bodyNode,
      PHYSICS_MOTION_TYPE.DYNAMIC,
      false,
      this.scene
    );
    body.shape = shape;
    body.setMassProperties({
      centerOfMass: bodyNode.absolutePosition,
      mass: 0.1,
      inertia: Vector3.Zero(),
    });

    body.setCollisionCallbackEnabled(true);
    body.setCollisionEndedCallbackEnabled(true);

    let isGroundedTimeout: globalThis.NodeJS.Timeout | undefined;
    body.getCollisionObservable().add((collisionEvent) => {
      switch (collisionEvent.type) {
        case "COLLISION_STARTED":
        case "COLLISION_CONTINUED": {
          if (isGroundedTimeout) {
            clearTimeout(isGroundedTimeout);
            isGroundedTimeout = undefined;
          }
          // this means character is landing
          if (!this.isGrounded) {
            eventBus.emit(`avatar:landing:${this.participant.identity}`, this);
          }
          this.isGrounded = true;
          break;
        }
      }
    });
    body.getCollisionEndedObservable().add(() => {
      if (isGroundedTimeout) {
        clearTimeout(isGroundedTimeout);
        isGroundedTimeout = undefined;
      }
      isGroundedTimeout = setTimeout(() => {
        isGroundedTimeout = undefined;
        this.isGrounded = false;
      }, 1000 / 24);
    });

    const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
    if (plugin) {
      this._physicsSyncingObservers.push(
        this.scene.onAfterPhysicsObservable.add(() => {
          (plugin as HavokPlugin)._hknp.HP_Body_SetPosition(
            body._pluginData.hpBodyId,
            this.root.getAbsolutePosition().asArray()
          );
        })
      );
    }

    this._physicsBodies.push(body);

    // for physics debugging
    // this.physicsViewer.showBody(body);
  }

  disposePhysicsBodies(): void {
    for (const observer of this._physicsSyncingObservers) observer.remove();
    this._physicsSyncingObservers = [];
    this._capsuleCopyObserver?.remove();
    this._capsuleCopyObserver = undefined;
    this._capsuleBody = undefined;
    for (const body of this._physicsBodies) body.dispose();
    this._physicsBodies = [];
    this._hitBoxBodies = [];
  }

  showAvatarInfo(): void {
    if (!this._profile) {
      import("./AvatarProfile").then(({ default: AvatarProfile }) => {
        this._profile = new AvatarProfile(this);
      });
    }

    // if is own user, don't create profile card
    if (this.isSelf || this._multiplayProfile) return;

    this._isCreatingProfileCard = true;
    import("./AvatarProfileCard").then(({ default: AvatarProfileCard }) => {
      this._multiplayProfile = new AvatarProfileCard(this, this.participant);
      this._isCreatingProfileCard = false;
    });
  }

  disposeAvatarInfo(): void {
    this._profile?.dispose();
    this._profile = undefined;
    this._multiplayProfile?.dispose();
    this._multiplayProfile = undefined;
    this._isCreatingProfileCard = false;
    this._clickedToOpenProfileCard = false;
  }

  async updateName(name: string): Promise<void> {
    this.participant.name = name;
    this._profile?.dispose();
    const { default: AvatarProfile } = await import("./AvatarProfile");
    this._profile = new AvatarProfile(this);
  }

  clearAllMeshes(): void {
    for (const mesh of this._meshes) mesh.dispose(false, true);
    this._meshes = [];
  }

  playAnimation(
    animation: string | AnimationGroup,
    loop: boolean = true,
    speedRatio: number = 1
  ): void {
    // const animRatio = this.scene.getAnimationRatio();
    // const animSpeed = animRatio < 1 ? 1 : animRatio;

    if (typeof animation === "string") {
      let animationName = animation;
      // if missing user identity, append it to animation name
      if (!animationName.includes(`_${this.participant.identity}`)) {
        animationName = animationName + "_" + this.participant.identity;
      }

      if (
        !(animationName in this._animations) ||
        this._animations[animationName] === this.playingAnimation
      )
        return;

      this.playingAnimation?.stop();
      this.playingAnimation = this._animations[animationName];
      this.isPlayingAnimationLooping = loop;
      this.playingAnimation.start(
        loop,
        speedRatio // ?? this.adlerEngine.engineCore.isLoadingLODs ? 1 : animSpeed
      );

      // if (clientSettings.DEBUG) {
      //   console.log('Playing animation from name for ', this.participant.identity, ':', animationName);
      // }
    } else {
      if (this.playingAnimation === animation) return;

      this.playingAnimation?.stop();
      this.playingAnimation = animation;
      this.isPlayingAnimationLooping = loop;
      this.playingAnimation.start(
        loop,
        speedRatio // ?? this.adlerEngine.engineCore.isLoadingLODs ? 1 : animSpeed
      );

      // if (clientSettings.DEBUG) {
      //   console.log(
      //     'Playing animation from animGroup for ',
      //     this.participant.identity,
      //     ':',
      //     animation.name
      //   );
      // }
    }
  }

  stopAllAnimations(): void {
    this.playingAnimation?.stop(true);
    this.playingAnimation = undefined;
    this.isPlayingAnimationLooping = false;
  }

  playInteraction(name: string, type: AvatarInteractionType): void {
    this.interaction = new AvatarInteraction(this, name, type);
    this.interaction.play(() => {
      this.interaction?.dispose();
      this.interaction = undefined;
    });

    this.isControlledByUser = true;
  }

  setNotControlledByUser(): void {
    this.isControlledByUser = false;
    // this.adlerEngine.nakamaWorld?.sendFreeOwnAvatarsFromCurrentSessionState();
  }

  getPosition(global?: boolean): Vector3 {
    return global ? this.root.absolutePosition : this.root.position;
  }

  getRotationQuaternion(global?: boolean): Quaternion {
    return global
      ? this.root.absoluteRotationQuaternion
      : this.root.rotationQuaternion ?? this.root.rotation.toQuaternion();
  }

  setPosition(position: Vector3): void {
    // no physics body or physics engine, just set root position
    const physicsEngine = this.scene.getPhysicsEngine();
    if (!this._capsuleBody || !physicsEngine) {
      this.root.position = position;
      return;
    }

    // this._capsuleBody.disablePreStep = false;
    // this._capsuleBodyNode!.position.set(position.x, position.y, position.z);
    // this.scene.onAfterPhysicsObservable.addOnce(() => {
    //   this._capsuleBody!.disablePreStep = true;
    // });

    // more consise version but only works with Havok physics plugin
    const plugin = physicsEngine.getPhysicsPlugin();
    (plugin as HavokPlugin)._hknp.HP_Body_SetPosition(
      this._capsuleBody._pluginData.hpBodyId,
      position.asArray()
    );
  }

  setRotationQuaternion(quaternion: Quaternion): void {
    this.root.rotationQuaternion = quaternion;

    const physicsEngine = this.scene.getPhysicsEngine();
    if (!this._capsuleBody || !physicsEngine) return;

    const plugin = physicsEngine.getPhysicsPlugin();
    (plugin as HavokPlugin)._hknp.HP_Body_SetOrientation(
      this._capsuleBody._pluginData.hpBodyId,
      quaternion.asArray()
    );
  }

  show(affectPhysicsBody: boolean = false): void {
    this._profile?.show();
    for (const mesh of this._meshes) mesh.setEnabled(true);
    if (affectPhysicsBody && this._capsuleBody) {
      const plugin = this.scene
        .getPhysicsEngine()!
        .getPhysicsPlugin() as HavokPlugin;
      plugin._hknp.HP_World_AddBody(
        plugin.world,
        this._capsuleBody._pluginData.hpBodyId,
        this._capsuleBody.startAsleep
      );
    }
    if (clientSettings.DEBUG) {
      console.log("Show avatar for user:", this.participant.identity);
    }
  }

  hide(affectPhysicsBody: boolean = false): void {
    this._profile?.hide();
    for (const mesh of this._meshes) mesh.setEnabled(false);
    if (affectPhysicsBody && this._capsuleBody) {
      const plugin = this.scene
        .getPhysicsEngine()!
        .getPhysicsPlugin() as HavokPlugin;
      plugin._hknp.HP_World_RemoveBody(
        plugin.world,
        this._capsuleBody._pluginData.hpBodyId
      );
      this._isCapsuleBodyColliding = false;
    }
    if (clientSettings.DEBUG) {
      console.log("Hide avatar for user:", this.participant.identity);
    }
  }

  toggleCrouchCapsuleBody(isCrouch: boolean = true): void {
    if (!this._capsuleBody || !this._capsuleBodyNode) return;

    // ========= for physics debugging =========
    // for (const mesh of this.scene.rootNodes) {
    //   // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //   if ((mesh as any).physicsBody) {
    //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //     this.physicsViewer.hideBody((mesh as any).physicsBody);
    //   }
    // }
    // ========= for physics debugging =========

    if (isCrouch) {
      this._capsuleBody.disableSync = true;
      if (!this.avatarBodyShapeCrouch) {
        const avatarPhysicsShapes = this.isSelf
          ? this.avatarPhysicsShapes
          : this.coreScene.remoteAvatarPhysicsShapes;
        avatarPhysicsShapes[this.gender].crouch ??= CreateAvatarPhysicsShape(
          this.scene,
          this.gender,
          true,
          !this.isSelf
        );
        this.avatarBodyShapeCrouch = avatarPhysicsShapes[this.gender].crouch!;
      }
      this._capsuleBody.shape = this.avatarBodyShapeCrouch;
      this.scene.onAfterPhysicsObservable.addOnce(() => {
        if (this._capsuleBody) this._capsuleBody.disableSync = false;

        // for physics debugging
        // this._physicsBodies.forEach(body => this.physicsViewer.showBody(body));
      });
    } else {
      this._capsuleBody.disableSync = true;
      if (!this.avatarBodyShapeFull) {
        const avatarPhysicsShapes = this.isSelf
          ? this.avatarPhysicsShapes
          : this.coreScene.remoteAvatarPhysicsShapes;

        avatarPhysicsShapes[this.gender].normal ??= CreateAvatarPhysicsShape(
          this.scene,
          this.gender,
          false,
          !this.isSelf
        );
        this.avatarBodyShapeFull = avatarPhysicsShapes[this.gender].normal!;
      }
      this._capsuleBody.shape = this.avatarBodyShapeFull;
      this.scene.onAfterPhysicsObservable.addOnce(() => {
        if (this._capsuleBody) this._capsuleBody.disableSync = false;

        // for physics debugging
        // this._physicsBodies.forEach(body => this.physicsViewer.showBody(body));
      });
    }
  }

  handleHeadRotationForAnimations(): void {
    if (this.isCrouching) {
      this.limitHeadRotation(
        -Math.PI * 0.05,
        Math.PI * 0.47,
        undefined,
        Math.PI * 0.1
      );
      return;
    }
    this.limitHeadRotation();
  }

  limitHeadRotation(
    minYaw: number = -Math.PI * 0.4,
    maxYaw: number = Math.PI * 0.4,
    minPitch: number = -Math.PI * 0.4,
    maxPitch: number = Math.PI * 0.4
  ): void {
    if (!this._boneLookController) return;

    this._boneLookController.minYaw = minYaw;
    this._boneLookController.maxYaw = maxYaw;
    this._boneLookController.minPitch = minPitch;
    this._boneLookController.maxPitch = maxPitch;
  }

  update(target?: Vector3): void {
    // cases to not update bone look controller
    switch (true) {
      case !this._boneLookController:
      case !this.playingAnimation:
      case !this.isGrounded:
      case this.isCrouching && this.isMoving:
      case this.interaction?.type === "continuous" &&
        this.interaction.continuousPhase !== 1:
      case this.interaction?.type === "loop":
      case this.interaction?.type === "gethit": {
        // - no animation is playing, no need to update bone look controller
        // - head looks up too much when in the air due to animation
        // - the head spins when avatar moves while crouching
        // - head glitches when avatar's get-hit animation is playing
        this.currentBoneLookControllerTarget = undefined;
        return;
      }
    }

    if (target) {
      this.currentBoneLookControllerTarget = target;
      this._boneLookController.target = target;
    } else if (this.currentBoneLookControllerTarget) {
      this._boneLookController.target = this.currentBoneLookControllerTarget;
    }

    // update the bone look controller
    this._boneLookController.update();
  }

  dispose(): void {
    this.scene.blockfreeActiveMeshesAndRenderingGroups = true;

    this._bones = undefined;
    this._morphTargetManager = undefined;
    this.currentAvatarId = "";
    this.isLoadingAvatar = false;

    this._multiplayProfile?.dispose();
    this._profile?.dispose();

    this._fallSceneObserver?.remove();
    this._fallSceneObserver = undefined;

    for (const animGroup of Object.values(this._animations))
      animGroup.dispose();
    this._animations = {};

    this._skeleton?.dispose();
    this._skeleton = undefined;

    for (const mesh of this._meshes) {
      // eslint-disable-next-line unicorn/no-null
      mesh.parent = null;
    }
    this._meshes = [];

    this._container?.dispose();
    this.root?.dispose(false, true);

    // dispose physics stuff
    this.disposePhysicsBodies();

    this.scene.blockfreeActiveMeshesAndRenderingGroups = false;
  }
}

export default Avatar;
