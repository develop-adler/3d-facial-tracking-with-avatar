// import "@babylonjs/core/Animations/animatable";
import "@babylonjs/core/Engines/Extensions/engine.query"; // for occlusion queries
import "@babylonjs/core/Rendering/boundingBoxRenderer"; // for occlusion queries
// import '@babylonjs/core/Meshes/thinInstanceMesh'; // for PhysicsViewer
// import { Animation } from "@babylonjs/core/Animations/animation";
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
  PhysicsShapeCylinder,
  PhysicsShapeSphere,
} from "@babylonjs/core/Physics/v2/physicsShape";
import type { Participant } from "livekit-client";

import type AvatarProfile from "@/3d/Multiplayer/AvatarProfile";
import type AvatarProfileCard from "@/3d/Multiplayer/AvatarProfileCard";
import AvatarInteraction from "@/3d/Multiplayer/AvatarInteraction";
import type {
  AvatarGender,
  AvatarInteractionType,
  ObjectQuaternion,
  ObjectTransform,
} from "@/apis/entities";
import eventBus from "@/eventBus";
import { waitForConditionAndExecute } from "@/utils/functionUtils";

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
import type { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { Nullable } from "@babylonjs/core/types";

type AnimationsRecord = Record<string, AnimationGroup>;

export type AvatarPhysicsShapes = {
  male: {
    normal: Nullable<PhysicsShapeCapsule>;
    short: Nullable<PhysicsShapeCapsule>;
  };
  female: {
    normal: Nullable<PhysicsShapeCapsule>;
    short: Nullable<PhysicsShapeCapsule>;
  };
  other: {
    normal: Nullable<PhysicsShapeCapsule>;
    short: Nullable<PhysicsShapeCapsule>;
  };
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

class Avatar {
  readonly scene: Scene;
  readonly participant: Participant;
  readonly gender: AvatarGender;
  readonly avatarUrl: string;
  readonly isSelf: boolean;

  private _profile: Nullable<AvatarProfile> = null;
  private _multiplayProfile: Nullable<AvatarProfileCard> = null;
  private _otherAvatars: Array<Avatar> = [];
  private _isCreatingProfileCard: boolean = false;
  private _clickedToOpenProfileCard: boolean = false;

  private readonly _root: TransformNode;
  private _container: Nullable<AssetContainer> = null;
  private _morphTargetManager: Nullable<MorphTargetManager> = null;
  private _rootMesh: Nullable<AbstractMesh> = null;
  private _meshes: Array<AbstractMesh> = [];
  private _skeleton: Nullable<Skeleton> = null;
  private _animations: Record<string, AnimationGroup> = {};
  private _boneLookController: Nullable<BoneLookController> = null;
  currentBoneLookControllerTarget: Nullable<Vector3> = null;

  private _capsuleBody: Nullable<PhysicsBody> = null;
  private _capsuleBodyNode: Nullable<TransformNode> = null;
  readonly avatarBodyShapeFull: PhysicsShapeContainer;
  readonly avatarBodyShapeCrouch: PhysicsShapeSphere;
  private readonly _physicsSyncingObservers: Array<Observer<Scene>> = [];
  private readonly _hitBoxBodies: Array<PhysicsBody> = [];
  private readonly _physicsBodies: Array<PhysicsBody> = [];
  readonly avatarBodyShapeFullForChecks: PhysicsShapeContainer;

  private _height: number = 0;
  private _capsuleCopyObserver: Nullable<Observer<Scene>> = null;

  // for physics debugging
  // private readonly physicsViewer: PhysicsViewer;

  playingAnimation: Nullable<AnimationGroup> = null;
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
  private _pointerUpCooldown: Nullable<NodeJS.Timeout> = null;

  avatarScenePickObserver: Nullable<Observer<PointerInfo>> = null;
  private _fallSceneObserver: Nullable<Observer<Scene>> = null;
  private _isCapsuleBodyColliding: boolean = false;
  private avatarFallTimeout: Nullable<NodeJS.Timeout> = null;
  avatarFallTimeoutTimer: number = 3500;
  avatarFallTimeoutCallback: Nullable<(avatar: this) => void> = null;

  interaction: Nullable<AvatarInteraction> = null;
  isAnimationsReady: boolean = false;
  isReady: boolean = false;

  private readonly _headHeight: number = AVATAR_PARAMS.CAMERA_HEAD_HEIGHT_MALE;

  constructor(
    scene: Scene,
    participant: Participant,
    avatarUrl: string,
    gender: AvatarGender,
    isSelf: boolean = false,
    physicsShapes?: {
      normal: PhysicsShapeCapsule;
      short: PhysicsShapeCapsule;
    },
    position?: Vector3 | ObjectTransform,
    rotation?: Quaternion | ObjectQuaternion
  ) {
    this.scene = scene;
    this.gender = gender;
    this.participant = participant;
    this.avatarUrl = avatarUrl;
    this.isSelf = isSelf;

    if (this.gender === "female")
      this._headHeight = AVATAR_PARAMS.CAMERA_HEAD_HEIGHT_FEMALE;

    this._preloadAnimationResources();

    const tNodeName = "avatarRootNode_" + participant.sid;
    this._root = new TransformNode(tNodeName, this.scene);

    if (position) {
      if (position instanceof Vector3) this._root.position = position.clone();
      else if (Array.isArray(position))
        this._root.position = Vector3.FromArray(position);
    }
    if (rotation) {
      if (rotation instanceof Quaternion)
        this._root.rotationQuaternion = rotation.clone();
      else if (Array.isArray(rotation))
        this._root.rotationQuaternion = Quaternion.FromArray(rotation);
    }

    if (physicsShapes) {
      this.avatarBodyShapeFull = physicsShapes.normal;
      this.avatarBodyShapeCrouch = physicsShapes.short;
    } else {
      this.avatarBodyShapeFull = Avatar.CreatePhysicsShape(
        this.scene,
        gender,
        false
      );
      this.avatarBodyShapeCrouch = Avatar.CreatePhysicsShape(
        this.scene,
        gender,
        true
      );
    }

    this.avatarBodyShapeFullForChecks = Avatar.CreatePhysicsShape(
      this.scene,
      gender,
      false
    );
    this.avatarBodyShapeFullForChecks.filterCollideMask =
      PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT;

    // for physics debugging
    // this.physicsViewer = new PhysicsViewer(scene);
  }

  // get highlightLayer(): HighlightLayer | undefined {
  //   return this.post?.atom3DObjects?.highlightLayer;
  // }
  get root(): TransformNode {
    return this._root;
  }
  get container(): Nullable<AssetContainer> {
    return this._container;
  }
  get morphTargetManager(): Nullable<MorphTargetManager> {
    return this._morphTargetManager;
  }
  get rootMesh(): Nullable<AbstractMesh> {
    return this._rootMesh;
  }
  get meshes(): Array<AbstractMesh> {
    return this._meshes;
  }
  get skeleton(): Nullable<Skeleton> {
    return this._skeleton;
  }
  get animations(): AnimationsRecord {
    return this._animations;
  }
  get boneLookController(): Nullable<BoneLookController> {
    return this._boneLookController;
  }
  get capsuleBody(): Nullable<PhysicsBody> {
    return this._capsuleBody;
  }
  get physicsBodies(): Array<PhysicsBody> {
    return this._physicsBodies;
  }
  get profile(): Nullable<AvatarProfile> {
    return this._profile;
  }
  get height(): number {
    return this._height;
  }
  get headHeight(): number {
    return this._headHeight;
  }
  get otherAvatars(): Array<Avatar> {
    return this._otherAvatars;
  }
  get isCapsuleBodyColliding(): boolean {
    return this._isCapsuleBodyColliding;
  }

  static CreatePhysicsShape(
    scene: Scene,
    gender: AvatarGender,
    isShort: boolean = false
  ): PhysicsShapeContainer | PhysicsShapeSphere {
    const capsuleHeight =
      gender === "male" || gender === "other"
        ? AVATAR_PARAMS.CAPSULE_HEIGHT_MALE
        : AVATAR_PARAMS.CAPSULE_HEIGHT_FEMALE;

    if (isShort) {
      // sphere shape for crouching (may need to update to box shape in the future)
      const shape = new PhysicsShapeSphere(
        new Vector3(0, AVATAR_PARAMS.CAPSULE_RADIUS * 2.5, 0),
        AVATAR_PARAMS.CAPSULE_RADIUS * 2.5,
        scene
      );
      shape.material = { friction: 0.4, restitution: 0 };
      shape.filterMembershipMask =
        PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_SELF;
      shape.filterCollideMask =
        PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT |
        PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_SELF |
        PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_OTHER;
      return shape;
    }

    const parentShape = new PhysicsShapeContainer(scene);

    const capsuleShape = new PhysicsShapeCapsule(
      new Vector3(0, AVATAR_PARAMS.CAPSULE_RADIUS, 0),
      new Vector3(0, capsuleHeight - AVATAR_PARAMS.CAPSULE_RADIUS, 0),
      AVATAR_PARAMS.CAPSULE_RADIUS,
      scene
    );
    capsuleShape.material = { friction: 0.4, restitution: 0 };
    capsuleShape.filterMembershipMask =
      PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_SELF;
    capsuleShape.filterCollideMask =
      PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT |
      PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_SELF |
      PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_OTHER;

    const cylinderShape = new PhysicsShapeCylinder(
      new Vector3(0, AVATAR_PARAMS.CAPSULE_RADIUS * 0.5, 0),
      new Vector3(0, (capsuleHeight - AVATAR_PARAMS.CAPSULE_RADIUS) * 1.15, 0),
      AVATAR_PARAMS.CAPSULE_RADIUS * 1.1,
      scene
    );
    cylinderShape.material = { friction: 0, restitution: 0 };
    cylinderShape.filterMembershipMask =
      PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_SELF;
    cylinderShape.filterCollideMask =
      PHYSICS_SHAPE_FILTER_GROUPS.ENVIRONMENT |
      PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_SELF |
      PHYSICS_SHAPE_FILTER_GROUPS.AVATAR_CAPSULE_OTHER;

    parentShape.addChild(capsuleShape);
    parentShape.addChild(cylinderShape);

    return parentShape;
  }

  setOtherAvatars(avatars: Array<Avatar>) {
    this._otherAvatars = avatars;
  }

  /**
   * Load avatar from avatar id
   */
  async loadAvatar(): Promise<this> {
    this.scene.blockMaterialDirtyMechanism = true;

    // const lods = [
    //   this.avatarModelInfo.lowQualityUrl,
    //   this.avatarModelInfo.mediumQualityUrl,
    //   this.avatarModelInfo.highQualityUrl,
    // ];

    // wait until scene environment map is loaded then load avatar
    // otherwise, the entire avatar will be black
    if (!this.scene.environmentTexture) {
      await waitForConditionAndExecute(
        () => this.scene.environmentTexture !== null,
        undefined,
        undefined,
        undefined,
        10000
      );
      await new Promise<void>((resolve) => {
        (this.scene.environmentTexture as CubeTexture).onLoadObservable.addOnce(
          () => {
            if (clientSettings.DEBUG) {
              console.log(
                "Scene environment map is loaded observable, loading avatar model..."
              );
            }
            resolve();
          }
        );
      });
    } else if (this.scene.environmentTexture.isReady() === false) {
      await new Promise<void>((resolve) => {
        (this.scene.environmentTexture as CubeTexture).onLoadObservable.addOnce(
          () => {
            if (clientSettings.DEBUG) {
              console.log(
                "Scene environment map is loaded observable, loading avatar model..."
              );
            }
            resolve();
          }
        );
      });
    }

    const container = await loadAssetContainerAsync(
      this.avatarUrl,
      this.scene,
      {
        pluginExtension: ".glb",
        pluginOptions: {
          gltf: {
            compileMaterials: true,
          },
        },
      }
    );
    this._container = container;
    container.addAllToScene();

    this._rootMesh = container.meshes[0];
    this._meshes = container.meshes.slice(1);
    this._skeleton = container.skeletons[0];
    this._morphTargetManager = container.morphTargetManagers[0];

    container.meshes.forEach((mesh, i) => {
      // is root mesh, skip
      if (i === 0) {
        mesh.parent = this._root; // assign root as parent
        mesh.isPickable = false;
        mesh.layerMask = 1 << 0; // visible on layer 0
        return;
      }

      // this._handleMorpTargets(mesh);

      const meshYPosition = mesh.getBoundingInfo().boundingBox.maximumWorld.y;
      if (meshYPosition > this._height) this._height = meshYPosition;

      mesh.receiveShadows = true;
      mesh.material?.freeze();
      mesh.isPickable = true;
      mesh.layerMask = 1 << 0; // visible on layer 0

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
    //     console.log(`avatar ${this.participant.sid} is occluded`);
    //   }
    // });

    this._showAvatarInfo();

    // show profile if exists
    this._profile?.show();

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

    // animation has to be loaded after avatar model is loaded
    // so the anims have bone target assigned
    this._loadAnimations(container.skeletons[0]);

    // this._rootMesh.getChildMeshes().forEach(mesh => {
    //   if (this.highlightLayer) {
    //     this.highlightLayer.removeMesh(mesh as Mesh);
    //     this.highlightLayer.addExcludedMesh(mesh as Mesh);
    //   }
    // });

    if (this.isAnimationsReady === true) {
      this.isReady = true;
      eventBus.emit(`avatar:ready:${this.participant.sid}`, this);
    } else {
      eventBus.once(`avatar:animationsReady:${this.participant.sid}`, () => {
        this.isReady = true;
        eventBus.emit(`avatar:ready:${this.participant.sid}`, this);
      });
    }

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
            case "pointerdown":
              this._isCameraMoved = false;
              start = performance.now();
              break;
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
                  import("@/3d/Multiplayer/AvatarProfileCard").then(
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
                    () => this._multiplayProfile !== null,
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
    AVATAR_ANIMATIONS.forEach(async (animName) => {
      const name =
        this.gender === "male"
          ? `Male${animName}.glb`
          : `Female${animName}.glb`;
      const url = "/static/avatar/animations/" + name;
      fetch(url);
    });
  }

  private async _loadAnimations(skeleton: Skeleton) {
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
        importedAnimation.targetedAnimations.forEach((ta) => {
          this.scene.stopAnimation(ta.target, ta.animation.name);
        });
        // importedAnimation.stop(true); // for some reason this doesn't work at all
        importedAnimation.enableBlending = true;
        importedAnimation.blendingSpeed = 0.05;

        const animationName =
          this.gender.charAt(0).toUpperCase() + this.gender.slice(1) + animName;
        this._animations[animationName] = importedAnimation;
      })
    );

    this.playingAnimation = null;
    this.isAnimationsReady = true;
    eventBus.emit(`avatar:animationsReady:${this.participant.sid}`, this);
  }

  loadPhysicsBodies(skeleton?: Skeleton): void {
    // load hitboxes for skeleton
    if (skeleton) this._generateHitBoxes(skeleton);

    // capsule body always has to be generated after the physics bodies
    // otherwise the physics bodies' position will not be correct
    this._capsuleBody = this._generateCapsuleBody(this._root.position);

    this._createGroundCheckBody();

    if (clientSettings.DEBUG) {
      console.log(
        `Physics bodies created for ${this.participant.sid}:`,
        this._physicsBodies.map((body) => body.transformNode.name)
      );
    }
  }

  private _generateCapsuleBody(position?: Vector3): PhysicsBody {
    const capsuleHeight =
      this.gender === "male"
        ? AVATAR_PARAMS.CAPSULE_HEIGHT_MALE
        : AVATAR_PARAMS.CAPSULE_HEIGHT_FEMALE;

    if (!this._capsuleBodyNode) {
      this._capsuleBodyNode = new TransformNode(
        "avatarCapsuleBodyNode_" + this.participant.sid,
        this.scene
      );
    }
    if (position) this._capsuleBodyNode.position = position;
    else this._capsuleBodyNode.position = Vector3.Zero();

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
        case "COLLISION_CONTINUED":
          this._isCapsuleBodyColliding = true;
          break;
      }
    });
    body.getCollisionEndedObservable().add(() => {
      this._isCapsuleBodyColliding = false;
    });

    this._physicsBodies.push(body);

    this._capsuleCopyObserver?.remove();
    this._capsuleCopyObserver = this.scene.onAfterPhysicsObservable.add(() => {
      if (!this._capsuleBodyNode) return;
      this._root.setAbsolutePosition(this._capsuleBodyNode.absolutePosition);
    });

    eventBus.emit(`avatar:capsuleBodyCreated:${this.participant.sid}`, body);

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
          this.avatarFallTimeout = null;
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
        bone.name + "_node_" + this.participant.sid,
        this.scene
      );
      bodyNode.position = bone.getAbsolutePosition(this.rootMesh);

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
              bone.getAbsolutePosition(this.rootMesh).asArray()
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
        bone.name + "_node_" + this.participant.sid,
        this.scene
      );
      bodyNode.position = bone.getAbsolutePosition(this.rootMesh);

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
                  const sid = collision.collidedAgainst.transformNode.name
                    .split("_")
                    .at(-1);

                  for (const avatar of this._otherAvatars) {
                    // if avatar is not already getting hit, play head flinch animation
                    if (
                      avatar.participant.sid === sid &&
                      avatar.interaction?.type === "hitting" &&
                      this.interaction?.type !== "gethit"
                    ) {
                      this.playInteraction("HeadFlinch", "gethit");
                      break;
                    }
                  }
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
                  const sid = collision.collidedAgainst.transformNode.name
                    .split("_")
                    .at(-1);

                  for (const avatar of this._otherAvatars) {
                    // if avatar is not already getting hit, play chest flinch animation
                    // and prevent having another flinch if already getting hit
                    if (
                      avatar.participant.name === sid &&
                      avatar.interaction?.type === "hitting" &&
                      this.interaction?.type !== "gethit"
                    ) {
                      this.playInteraction("ChestFlinch", "gethit");
                      break;
                    }
                  }
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
              bone.getAbsolutePosition(this.rootMesh).asArray()
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
      "groundCheckBody_node_" + this.participant.sid,
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

    let isGroundedTimeout: Nullable<NodeJS.Timeout> = null;
    body.getCollisionObservable().add((collisionEvent) => {
      switch (collisionEvent.type) {
        case "COLLISION_STARTED":
        case "COLLISION_CONTINUED":
          if (isGroundedTimeout) {
            clearTimeout(isGroundedTimeout);
            isGroundedTimeout = null;
          }
          // this means character is landing
          if (!this.isGrounded) {
            eventBus.emit(`avatar:landing:${this.participant.sid}`, this);
          }
          this.isGrounded = true;
          break;
      }
    });
    body.getCollisionEndedObservable().add(() => {
      if (isGroundedTimeout) {
        clearTimeout(isGroundedTimeout);
        isGroundedTimeout = null;
      }
      isGroundedTimeout = setTimeout(() => {
        isGroundedTimeout = null;
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

  private _showAvatarInfo(): void {
    import("./AvatarProfile").then(({ default: AvatarProfile }) => {
      this._profile = new AvatarProfile(this);
    });

    // if is own user, don't create profile card
    if (this.isSelf) return;

    this._isCreatingProfileCard = true;
    import("./AvatarProfileCard").then(({ default: AvatarProfileCard }) => {
      this._multiplayProfile = new AvatarProfileCard(this, this.participant);
      this._isCreatingProfileCard = false;
    });
  }

  async updateName(name: string): Promise<void> {
    this.participant.name = name;
    this._profile?.dispose();
    const AvatarProfile = (await import("./AvatarProfile")).default;
    this._profile = new AvatarProfile(this);
  }

  clearAllMeshes(): void {
    this._meshes.forEach((mesh) => mesh.dispose(false, true));
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
      const gender = this.gender.charAt(0).toUpperCase() + this.gender.slice(1);

      // prefix gender to animation name if not already prefixed
      if (!animationName.includes(gender)) {
        animationName = gender + animationName;
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
      //   console.log('Playing animation from name for ', this.participant.sid, ':', animationName);
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
      //     this.participant.sid,
      //     ':',
      //     animation.name
      //   );
      // }
    }
  }

  playInteraction(name: string, type: AvatarInteractionType): void {
    this.interaction = new AvatarInteraction(this, name, type);
    this.interaction.play(() => {
      this.interaction?.dispose();
      this.interaction = null;
    });

    this.isControlledByUser = true;
  }

  setNotControlledByUser(): void {
    this.isControlledByUser = false;
    // this.adlerEngine.nakamaWorld?.sendFreeOwnAvatarsFromCurrentSessionState();
  }

  getPosition(global?: boolean): Vector3 {
    return global ? this._root.absolutePosition : this._root.position;
  }

  getRotationQuaternion(global?: boolean): Quaternion {
    return global
      ? this._root.absoluteRotationQuaternion
      : this._root.rotationQuaternion ??
      this._root.rotation.toQuaternion();
  }

  setPosition(position: Vector3): void {
    // no physics body or physics engine, just set root position
    const physicsEngine = this.scene.getPhysicsEngine();
    if (this._capsuleBody === null || !physicsEngine) {
      this._root.position = position;
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
    this._root.rotationQuaternion = quaternion;

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
    this._meshes.forEach((mesh) => mesh.setEnabled(true));
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
      console.log("Show avatar for user:", this.participant.sid);
    }
  }

  hide(affectPhysicsBody: boolean = false): void {
    this._profile?.hide();
    this._meshes.forEach((mesh) => mesh.setEnabled(false));
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
      console.log("Hide avatar for user:", this.participant.sid);
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
      this._capsuleBody.shape = this.avatarBodyShapeCrouch;
      this.scene.onAfterPhysicsObservable.addOnce(() => {
        if (this._capsuleBody) this._capsuleBody.disableSync = false;

        // for physics debugging
        // this._physicsBodies.forEach(body => this.physicsViewer.showBody(body));
      });
    } else {
      this._capsuleBody.disableSync = true;
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

  update(target: Vector3): void {
    // cases to not update bone look controller
    switch (true) {
      case !this._boneLookController:
      case !this.playingAnimation:
      case !this.isGrounded:
      case this.isCrouching && this.isMoving:
      case this.interaction?.type === "gethit":
        // - no animation is playing, no need to update bone look controller
        // - head looks up too much when in the air due to animation
        // - the head spins when avatar moves while crouching
        // - head glitches when avatar's get-hit animation is playing
        this.currentBoneLookControllerTarget = null;
        return;
    }

    this.currentBoneLookControllerTarget = target;
    this._boneLookController.target = target;

    // update the bone look controller
    this._boneLookController.update();
  }

  dispose(): void {
    this.scene.blockfreeActiveMeshesAndRenderingGroups = true;

    this._multiplayProfile?.dispose();
    this._profile?.dispose();

    this._fallSceneObserver?.remove();
    this._fallSceneObserver = null;

    Object.values(this._animations).forEach((animGroup) => animGroup.dispose());
    this._animations = {};

    this._skeleton?.dispose();
    this._skeleton = null;

    this._meshes.forEach((mesh) => {
      mesh.parent = null;
      mesh.dispose();
    });
    this._meshes = [];

    this._rootMesh?.dispose(false, true);
    this._rootMesh = null;
    this._root?.dispose(false, true);

    // remove observers
    this._physicsSyncingObservers.forEach((observer) => observer.remove());
    this._capsuleCopyObserver?.remove();
    this._capsuleCopyObserver = null;

    // dispose physics bodies
    this._capsuleBody = null;
    this._physicsBodies.forEach((body) => body.dispose());

    this.scene.blockfreeActiveMeshesAndRenderingGroups = false;
  }
}

export default Avatar;
