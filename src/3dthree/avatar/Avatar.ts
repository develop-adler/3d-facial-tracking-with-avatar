import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  Object3D,
  Quaternion,
  Raycaster,
  Scene,
  Skeleton,
  SkinnedMesh,
  Vector2,
  Vector3,
  type QuaternionTuple,
  type Vector3Tuple,
} from "three";
import { type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
// import { IK, IKChain, IKJoint, IKBallConstraint, IKHelper } from '@/utils/three-ik/';

import { LocalParticipant, type RemoteParticipant } from "livekit-client";

import type AvatarProfile from "@/3d/avatar/AvatarProfile";
import type AvatarProfileCard from "@/3d/avatar/AvatarProfileCard";
import AvatarInteraction from "@/3d/avatar/AvatarInteraction";
import AvatarVoiceBubble from "@/3d/avatar/AvatarVoiceBubble";
import type CoreScene from "@/3dthree/core/CoreScene";
import eventBus from "@/eventBus";
import type { AvatarGender, AvatarInteractionType } from "@/models/3d";
import { useAvatarStore } from "@/stores/useAvatarStore";
import { useAvatarLoadingStore } from "@/stores/useAvatarLoadingStore";
import { isValidRPMAvatarId, normalize } from "@/utils/utilities";

import { clientSettings } from "clientSettings";
import { AVATAR_PARAMS } from "constant";
import { clamp } from "three/src/math/MathUtils.js";
import { deepDispose } from "@/utils/three/deepDispose";

// import type { VRM } from "@/utils/babylon-vrm.es";

type AnimationsRecord = Record<string, AnimationClip>;

// type IKTargetTransforms = {
//   head: Vector3;
//   leftShoulderRotation: Vector3;
//   rightShoulderRotation: Vector3;
//   leftElbowRotation: Vector3;
//   rightElbowRotation: Vector3;
//   leftHandPosition: Vector3;
//   rightHandPosition: Vector3;
// };

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
    &pose=T
`.replaceAll(/\s+/g, "");

const DEFAULT_AVATAR_ID = "67fe6f7713b3fb7e8aa0328c";

class Avatar {
  readonly coreScene: CoreScene;
  private _participant: LocalParticipant | RemoteParticipant;
  gender: AvatarGender;
  readonly isSelf: boolean;
  readonly headHeight: number = AVATAR_PARAMS.CAMERA_HEAD_HEIGHT_MALE;

  private _voiceBubble?: AvatarVoiceBubble;
  private _profile?: AvatarProfile;
  private _multiplayProfile?: AvatarProfileCard;
  private _isCreatingProfileCard: boolean = false;
  private _clickedToOpenProfileCard: boolean = false;

  root: Group;
  customHeadNode: Object3D;
  private _gltf?: GLTF;
  private _bonesByName: Map<string, Bone> = new Map();
  private _boneIndicesByName: Map<string, number> = new Map(); // For CCDIKSolver
  private _rootMesh?: Object3D;
  private _skinnedMesh?: SkinnedMesh;
  private _meshes: Array<Mesh | SkinnedMesh> = [];
  private _skeleton?: Skeleton;
  private _animations: AnimationsRecord = {};
  private _animationMixer?: AnimationMixer;
  vrm?: VRM;
  private _vrmRemoveUpdateFunc?: () => void;
  rpmId: string = "";

  // This will hold the main IK instance
  // private _ik?: IK;
  // private _ikTargetTransforms: IKTargetTransforms;
  // ikHandTargets: {
  //   left: Object3D;
  //   right: Object3D;
  // };
  private _updateRemoveFunc?: () => void;

  private _height: number = 0;

  currentBoneLookControllerTarget?: Vector3;
  dontSyncHeadWithUser: boolean = false;
  isLoadingAvatar: boolean = false;
  playingAnimationAction?: AnimationAction;
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

  private avatarFallTimeout?: globalThis.NodeJS.Timeout;
  avatarFallTimeoutTimer: number = 3500;
  avatarFallTimeoutCallback?: (avatar: this) => void;

  interaction?: AvatarInteraction;
  isAnimationsReady: boolean = false;
  isReady: boolean = false;

  constructor(
    coreScene: CoreScene,
    participant: LocalParticipant | RemoteParticipant,
    gender: AvatarGender,
    isSelf: boolean = false,
    position?: Vector3 | Vector3Tuple,
    rotation?: Quaternion | QuaternionTuple
  ) {
    this.coreScene = coreScene;
    this.gender = gender;
    this._participant = participant;
    this.isSelf = isSelf;

    if (this.gender === "female")
      this.headHeight = AVATAR_PARAMS.CAMERA_HEAD_HEIGHT_FEMALE;

    this._preloadAnimationResources();

    this.root = new Group();
    this.root.name = `avatarRootNode_${participant.identity}`;

    this.customHeadNode = new Object3D();
    this.customHeadNode.name = `customHeadNode_${participant.identity}`;

    if (position) {
      if (position instanceof Vector3) this.root.position.copy(position);
      else if (Array.isArray(position)) this.root.position.fromArray(position);
    }
    if (rotation) {
      if (rotation instanceof Quaternion) this.root.quaternion.copy(rotation);
      else if (Array.isArray(rotation))
        this.root.quaternion.fromArray(rotation);
    }

    // this._ikTargetTransforms = {
    //   head: new Vector3(),
    //   leftShoulderRotation: new Vector3(),
    //   rightShoulderRotation: new Vector3(),
    //   leftElbowRotation: new Vector3(),
    //   rightElbowRotation: new Vector3(),
    //   leftHandPosition: new Vector3(),
    //   rightHandPosition: new Vector3(),
    // };
    // // Initialize our IK target objects
    // this.ikHandTargets = {
    //   left: new Object3D(),
    //   right: new Object3D(),
    // };
    // this.ikHandTargets.left.name = "LeftHandIK_Target";
    // this.ikHandTargets.right.name = "RightHandIK_Target";
  }

  get scene(): Scene {
    return this.coreScene.scene;
  }
  get participant(): LocalParticipant | RemoteParticipant {
    return this._participant;
  }
  // get ikTargetTransforms(): IKTargetTransforms {
  //   return this._ikTargetTransforms;
  // }
  get gltf(): GLTF | undefined {
    return this._gltf;
  }
  get morphTargetMeshes(): Mesh[] {
    const morphMeshes: Mesh[] = [];
    for (const mesh of this._meshes) {
      if (
        (mesh as SkinnedMesh).morphTargetInfluences &&
        (mesh as SkinnedMesh).morphTargetDictionary
      ) {
        morphMeshes.push(mesh as SkinnedMesh);
      }
    }
    return morphMeshes;
  }
  get meshes(): Array<Mesh | SkinnedMesh> {
    return this._meshes;
  }
  get skeleton(): Skeleton | undefined {
    return this._skeleton;
  }
  get bones(): Bone[] | undefined {
    return this._skeleton?.bones;
  }
  get bonesByName(): Map<string, Bone> {
    return this._bonesByName;
  }
  get boneIndicesByName(): Map<string, number> {
    return this._boneIndicesByName;
  }
  get animationMixer(): AnimationMixer | undefined {
    return this._animationMixer;
  }
  get animations(): AnimationsRecord {
    return this._animations;
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

  setParticipant(participant: LocalParticipant | RemoteParticipant): this {
    this._participant = participant;
    return this;
  }

  async loadVRMAvatar(): Promise<this> {
    const loader = this.coreScene.coreEngine.gltfLoader;
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    try {
      this.isLoadingAvatar = true;
      const gltf = await loader.loadAsync(
        // URL of the VRM you want to load
        "/static/vrm/SampleB.vrm",
        (progress) => {
          const percentage = Math.floor(
            (progress.loaded / progress.total) * 100
          );
          useAvatarLoadingStore.getState().setLoadingPercentage(percentage);
        }
      );

      useAvatarLoadingStore.getState().setNotLoading();

      this._clearExistingAvatarData();

      const mesh = gltf.scene;

      const vrm = gltf.userData.vrm as VRM;
      this.vrm = vrm;

      this.coreScene.ambientLight.intensity = 4;

      // calling these functions greatly improves the performance
      VRMUtils.removeUnnecessaryVertices(mesh);
      VRMUtils.combineSkeletons(mesh);
      VRMUtils.combineMorphs(vrm);

      // does not work
      // this._processMToonMaterials(vrm);
      // if (vrm.materials) {
      //   const texture = this.coreScene.atom.skybox.premGenTexture;
      //   for (const material of vrm.materials) {
      //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
      //     const material = material as any;
      //     material.envMap = texture;
      //     material.envMapIntensity = 1;
      //     // material.combine = MultiplyOperation;
      //     // material.uniforms.envMap.value = texture;
      //     console.log("Mtoon material:", material, "envMap:", material.envMap, material.uniforms);
      //   }
      // }

      // wait until the model can be added to the scene without blocking due to shader compilation
      await this.coreScene.coreEngine.renderer.compileAsync(
        mesh,
        this.coreScene.camera,
        this.scene
      );

      // avatar mesh will be processed and added to scene in this function
      this._processLoadedModel(gltf, true, false);

      if (clientSettings.DEBUG) console.log("VRM manager:", vrm);

      this._vrmRemoveUpdateFunc = this.coreScene.addBeforeRenderCallback(() => {
        this.vrm?.update(this.coreScene.clock.getDelta());
      });

      eventBus.emit(`avatar:modelLoaded:${this._participant.identity}`, gltf);
    } catch (error) {
      if (clientSettings.DEBUG) {
        console.error("Error loading VRM avatar:", error);
      }
    } finally {
      this.isLoadingAvatar = false;
    }
    return this;
  }

  async loadRPMAvatar(
    id: string = useAvatarStore.getState().avatarId ?? DEFAULT_AVATAR_ID,
    gender?: AvatarGender,
    isVideoChat: boolean = false,
    fromChangeEvent: boolean = false
  ): Promise<this> {
    if (this.isLoadingAvatar || this.rpmId === id) return this;

    this.gender =
      gender ??
      (await fetch(`https://models.readyplayer.me/${id}.json`)
        .then((res) => res.json())
        .then((data) =>
          data.outfitGender === "masculine" ? "male" : "female"
        ));

    this.isLoadingAvatar = true;
    useAvatarLoadingStore.getState().setStartLoading();

    if (this._participant instanceof LocalParticipant) {
      try {
        this._participant.setAttributes({
          avatarId: id,
          gender: this.gender,
        });
      } catch {
        // empty
      }
    }

    const urlToLoad =
      `https://models.readyplayer.me/${id}.glb?` + RPM_AVATAR_PARAMS;

    try {
      const gltf = await this.coreScene.coreEngine.gltfLoader.loadAsync(
        urlToLoad,
        (progress) => {
          const percentage = Math.floor(
            (progress.loaded / progress.total) * 100
          );
          useAvatarLoadingStore.getState().setLoadingPercentage(percentage);
        }
      );

      this._clearExistingAvatarData();

      useAvatarLoadingStore.getState().setNotLoading();
      useAvatarStore.getState().setAvatarId(id, this.gender);

      this.rpmId = id;

      await this.coreScene.coreEngine.renderer.compileAsync(
        gltf.scene,
        this.coreScene.camera,
        this.scene
      );

      // avatar mesh will be processed and added to scene in this function
      this._processLoadedModel(gltf, isVideoChat, fromChangeEvent);

      eventBus.emit(`avatar:modelLoaded:${this._participant.identity}`, gltf);

      // TODO: Update other avatar classes
      // if (!this._voiceBubble) {
      //   this._voiceBubble = new AvatarVoiceBubble(this);
      // }
    } catch (error) {
      console.error("Error loading avatar model:", error);
      useAvatarLoadingStore.getState().setNotLoading();
    } finally {
      this.isLoadingAvatar = false;
    }
    return this;
  }

  private _clearExistingAvatarData(): void {
    this.coreScene.ambientLight.intensity = 0;

    this._vrmRemoveUpdateFunc?.();
    this._vrmRemoveUpdateFunc = undefined;

    this._updateRemoveFunc?.();
    this._updateRemoveFunc = undefined;

    // this._ik?.getRootBone().removeFromParent();
    // this.ikHandTargets.left.removeFromParent();
    // this.ikHandTargets.right.removeFromParent();
    // this._ik = undefined;

    if (this._gltf) deepDispose(this._gltf.scene);
    this._gltf = undefined;
    this._meshes = [];
    this._skinnedMesh = undefined;
    this._skeleton = undefined;
    this._bonesByName.clear();
    this._boneIndicesByName.clear();
    if (this._animationMixer) {
      this._animationMixer.stopAllAction();
      this._animationMixer.uncacheRoot(this._rootMesh!);
      this._animationMixer = undefined;
    }
    this._animations = {};
  }

  private _processLoadedModel(
    gltf: GLTF,
    isVideoChat: boolean = false,
    fromChangeEvent: boolean = false
  ): void {
    this._gltf = gltf;

    const mesh = gltf.scene;

    this.root.add(mesh);
    this._rootMesh = mesh;

    this._meshes = [];
    this._bonesByName.clear();
    this._boneIndicesByName.clear();

    mesh.traverse((object) => {
      if (object instanceof Mesh || object instanceof SkinnedMesh) {
        this._meshes.push(object);

        object.frustumCulled = false; // Disable frustum culling
        object.castShadow = true;
        object.receiveShadow = true;

        if (object instanceof SkinnedMesh) {
          if (!this._skinnedMesh) this._skinnedMesh = object;
          if (!this._skeleton) this._skeleton = object.skeleton;

          object.skeleton.bones.forEach((bone, index) => {
            this._bonesByName.set(bone.name, bone);
            this._boneIndicesByName.set(bone.name, index);
          });
        }
      }
    });

    console.log("this._boneIndicesByName:", this._boneIndicesByName);

    if (this._meshes.length > 0) {
      const box = new Box3().setFromObject(this._rootMesh);
      this._height = box.max.y - box.min.y;
    }

    if (gltf.animations && gltf.animations.length > 0) {
      this._animationMixer = new AnimationMixer(this._rootMesh);
      for (const clip of gltf.animations) {
        const animName = clip.name.replace(
          `_${this._participant.identity}`,
          ""
        );
        this._animations[animName] = clip;
      }
    }

    if (fromChangeEvent || !this.isAnimationsReady) {
      this.loadAnimations(gltf.animations);
    }

    // position camera in front of avatar
    const headBone = this.vrm
      ? this.vrm?.humanoid.getNormalizedBoneNode("head")
      : this._bonesByName.get("Head") ?? this._bonesByName.get("head");

    if (headBone) {
      const headWorldPos = new Vector3();
      headBone.getWorldPosition(headWorldPos);

      // set custom head node position and add it to the root
      this.customHeadNode.position.copy(this.root.worldToLocal(headWorldPos));
      this.root.add(this.customHeadNode);

      this.coreScene.camera.position.set(
        headWorldPos.x,
        headWorldPos.y,
        headWorldPos.z - 0.7
      );
      this.coreScene.controls.target.copy(headWorldPos);
    }

    if (isVideoChat && !this.vrm) {
      // this._setupRPMIK();

      // Add the external target objects to the scene so we can see/move them
      // this.scene.add(this.ikHandTargets.left);
      // this.scene.add(this.ikHandTargets.right);
    }

    if (!this.isSelf) this._setupPointerEvents();

    this.scene.add(this.root);
    this.isReady = true;
    eventBus.emit(`avatar:ready:${this._participant.identity}`, this);

    this._updateRemoveFunc?.();
    this._updateRemoveFunc = this.coreScene.addBeforeRenderCallback(
      (deltaTime: number) => {
        this.update(deltaTime);
      }
    );
  }

  // private _processMToonMaterials(vrm: VRM): void {
  //   if (!vrm.materials) return;

  //   const reflectivity = 0.4; // Control reflection strength (0.0 to 1.0)

  //   for (const mat of vrm.materials) {
  //     const material = mat as ShaderMaterial;// Step 4a: Add our custom uniforms to the material.

  //     // The renderer will upload these to the GPU.
  //     material.uniforms.envMap = { value: this.scene.environment };
  //     material.uniforms.reflectivity = { value: reflectivity };

  //     material.needsUpdate = true;
  //   }
  // }

  // private _setupRPMIK(): void {
  //   if (!this._skinnedMesh) return;

  //   // Create the main IK instance
  //   this._ik = new IK();

  //   // Create the chain for the left arm
  //   const leftArm = this.bonesByName.get("LeftArm");
  //   const leftForeArm = this.bonesByName.get("LeftForeArm");
  //   const leftHand = this.bonesByName.get("LeftHand");

  //   if (leftArm !== undefined && leftForeArm !== undefined && leftHand !== undefined) {
  //     // The chain is built from the "top down" (shoulder to hand)
  //     // We also add constraints to make the joints bend realistically.
  //     const leftArmJoint = new IKJoint(leftArm, {
  //       constraints: [new IKBallConstraint(90)], // 90-degree cone of movement
  //     });
  //     const leftForeArmJoint = new IKJoint(leftForeArm, {
  //       constraints: [new IKBallConstraint(90)],
  //     });
  //     const leftHandJoint = new IKJoint(leftHand); // The hand is the end effector

  //     // Add the joints to the chain IN ORDER from parent to child
  //     const leftChain = new IKChain();
  //     leftChain.add(leftArmJoint);
  //     leftChain.add(leftForeArmJoint);
  //     leftChain.add(leftHandJoint, { target: this.ikHandTargets.left });

  //     // Add the chain to the IK system
  //     this._ik.add(leftChain);
  //   }

  //   // Create the chain for the right arm
  //   const rightArm = this.bonesByName.get("RightArm");
  //   const rightForeArm = this.bonesByName.get("RightForeArm");
  //   const rightHand = this.bonesByName.get("RightHand");

  //   if (rightArm !== undefined && rightForeArm !== undefined && rightHand !== undefined) {
  //     const rightArmJoint = new IKJoint(rightArm, {
  //       constraints: [new IKBallConstraint(90)],
  //     });
  //     const rightForeArmJoint = new IKJoint(rightForeArm, {
  //       constraints: [new IKBallConstraint(90)],
  //     });
  //     const rightHandJoint = new IKJoint(rightHand);

  //     const rightChain = new IKChain();
  //     rightChain.add(rightArmJoint);
  //     rightChain.add(rightForeArmJoint);
  //     rightChain.add(rightHandJoint, { target: this.ikHandTargets.right });

  //     // Add the chain to the IK system
  //     this._ik.add(rightChain);
  //   }

  //   // Ensure the root bone is added somewhere in the scene
  //   this.scene.add(this._ik.getRootBone());

  //   // Create a helper and add to the scene so we can visualize the bones
  //   const helper = new IKHelper(this._ik);
  //   this.scene.add(helper as unknown as Object3D); // helper extends Object3D
  // }

  private _setupPointerEvents(): void {
    if (!this.coreScene.coreEngine.renderer) {
      console.warn("Renderer not available in CoreScene for pointer events.");
      return;
    }
    const rendererDomElement = this.coreScene.coreEngine.renderer.domElement;

    let start = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      this._isCameraMoved = false;
      start = performance.now();
    };

    const onPointerUp = async (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (performance.now() - start > 300) return;
      if (this._isCameraMoved) return;
      if (!this._isPointerUpEnabled) return;

      this._isPointerUpEnabled = false;
      if (this._pointerUpCooldown) clearTimeout(this._pointerUpCooldown);
      this._pointerUpCooldown = setTimeout(() => {
        this._isPointerUpEnabled = true;
      }, (1000 / 60) * 2);

      const raycaster = new Raycaster();
      const pointer = new Vector2();
      const canvas = this.coreScene.coreEngine.renderer.domElement;
      pointer.x = (event.clientX / canvas.clientWidth) * 2 - 1;
      pointer.y = -(event.clientY / canvas.clientHeight) * 2 + 1;

      raycaster.setFromCamera(pointer, this.coreScene.camera);
      const intersects = raycaster.intersectObjects(this._meshes, true);

      if (intersects.length > 0) {
        const pickedMesh = intersects[0].object;
        if (pickedMesh && this._meshes.includes(pickedMesh as Mesh)) {
          this._multiplayProfile?.show();
        } else if (
          this._multiplayProfile &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pickedMesh !== (this._multiplayProfile as any).htmlMesh
        ) {
          this._multiplayProfile?.hide();
        }
        return;
      } else {
        this._multiplayProfile?.hide();
      }
    };

    rendererDomElement.addEventListener("pointerdown", onPointerDown);
    rendererDomElement.addEventListener("pointerup", onPointerUp);
  }

  async changeRPMAvatar(url: string): Promise<this | undefined> {
    if (this.isLoadingAvatar) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!this.isLoadingAvatar) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    }

    const id = url.split("/").pop()?.split(".")[0];
    if (!id || !isValidRPMAvatarId(id)) {
      globalThis.alert("Invalid avatar URL");
      return undefined;
    }
    if (this.rpmId === id) return this;
    return this.loadRPMAvatar(id, undefined, undefined, true);
  }

  resetAvatarForVideoChat(): void {
    this._animationMixer?.stopAllAction();
    this._skeleton?.pose();

    // Force one update of the IK solver to pose the arms
    this.update(0);
  }

  private async _preloadAnimationResources(): Promise<void> {
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

  async loadAnimations(existingClips?: AnimationClip[]): Promise<void> {
    if (!this._skeleton) {
      console.error("No avatar skeleton found, load animation failed");
      return;
    }
    if (!this._rootMesh) {
      console.error("Avatar root mesh not initialized for animations.");
      return;
    }
    if (!this._animationMixer && this._rootMesh) {
      this._animationMixer = new AnimationMixer(this._rootMesh);
    }

    const newAnimations: AnimationsRecord = {};
    if (existingClips) {
      for (const clip of existingClips) {
        const animName = clip.name.replace(
          `_${this._participant.identity}`,
          ""
        );
        newAnimations[animName] = clip;
      }
    }

    const animationPromises = AVATAR_ANIMATIONS.map(async (animName) => {
      if (newAnimations[animName]) return;

      const fileName =
        this.gender === "male"
          ? `Male${animName}.glb`
          : `Female${animName}.glb`;
      const url = "/static/avatar/animations/" + fileName;

      try {
        const animGltf = await this.coreScene.coreEngine.gltfLoader.loadAsync(
          url
        );
        if (animGltf.animations && animGltf.animations.length > 0) {
          const clip = animGltf.animations[0];
          const finalAnimName = animName;
          clip.name = `${finalAnimName}_${this._participant.identity}`;
          newAnimations[finalAnimName] = clip;
        }
      } catch (error) {
        console.error(
          `Failed to load animation ${animName} from ${url}:`,
          error
        );
      }
    });

    await Promise.all(animationPromises);
    this._animations = { ...this._animations, ...newAnimations };

    if (clientSettings.DEBUG)
      console.log("Avatar animations loaded:", Object.keys(this._animations));

    this.playingAnimationAction = undefined;
    this.isAnimationsReady = true;
    eventBus.emit(`avatar:animationsReady:${this._participant.identity}`, this);
  }

  loadPhysicsBodies(): void {
    console.warn("loadPhysicsBodies: Not implemented for Three.js.");
  }

  /**
   * Returns an array of all available morph targets for this avatar.
   */
  getMorphTargets() {
    return this._skinnedMesh?.morphTargetDictionary ?? {};
  }

  /**
   * Sets the influence of a specific morph target (shape key) by its name.
   * The names correspond to the ARKit blend shapes (e.g., 'jawOpen', 'eyeBlinkLeft').
   * @param {string} name The name of the morph target to control.
   * @param {number} value The influence value, typically from 0.0 to 1.0.
   */
  setMorphTarget(name: string, value: number): void {
    // 1. Ensure we have a mesh with morph targets
    if (!this._skinnedMesh || !this._skinnedMesh.morphTargetDictionary) {
      // console.warn("Avatar has no SkinnedMesh with morph targets to control.");
      return;
    }

    // 2. Look up the index for the given morph target name
    const index = this._skinnedMesh.morphTargetDictionary[name];

    // 3. Check if the name was valid
    if (index === undefined) {
      // console.warn(`Morph target "${name}" not found on this avatar.`);
      return;
    }

    // Enhance blink sensitivity
    let val = value;
    if (name.includes("eyeBlink")) {
      val = clamp(normalize(value, 0, 0.6), 0, 1);
    }

    // 4. Ensure the influences array exists and set the value
    if (this._skinnedMesh.morphTargetInfluences) {
      this._skinnedMesh.morphTargetInfluences[index] = val;
    }
  }

  showAvatarInfo(): void {
    // TODO: update other avatar classes
    // if (!this._profile) {
    //   import("./AvatarProfile").then(({ default: AvatarProfile }) => {
    //     this._profile = new AvatarProfile(this);
    //   });
    // }
    // if (this.isSelf || this._multiplayProfile) return;
    // this._isCreatingProfileCard = true;
    // import("./AvatarProfileCard").then(({ default: AvatarProfileCard }) => {
    //   this._multiplayProfile = new AvatarProfileCard(this, this._participant);
    //   this._isCreatingProfileCard = false;
    // });
  }

  disposeAvatarInfo(): void {
    this._profile?.dispose();
    this._profile = undefined;
    this._multiplayProfile?.dispose();
    this._multiplayProfile = undefined;
    this._isCreatingProfileCard = false;
    this._clickedToOpenProfileCard = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateName(name: string): Promise<void> {
    // TODO: update other avatar classes
    // if (this._participant.name === undefined) {
    //   console.warn("Participant name cannot be directly set.");
    // } else {
    //   this._participant.name = name;
    // }
    // this._profile?.dispose();
    // const { default: AvatarProfile } = await import("./AvatarProfile");
    // this._profile = new AvatarProfile(this);
  }

  clearAllMeshes(): void {
    for (const mesh of this._meshes) {
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m.dispose();
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    }
    this._meshes = [];
  }

  playAnimation(
    animationNameKey: string,
    loop: boolean = true,
    speedRatio: number = 1,
    transitionDuration: number = 0.2
  ): void {
    if (!this._animationMixer) return;

    const animationClip = this._animations[animationNameKey];
    if (!animationClip) {
      console.warn(
        `Animation "${animationNameKey}" not found for avatar ${this._participant.identity}`
      );
      return;
    }

    const newAction = this._animationMixer.clipAction(
      animationClip,
      this._rootMesh
    );

    if (
      this.playingAnimationAction === newAction &&
      this.isPlayingAnimationLooping === loop &&
      this.playingAnimationAction?.isRunning()
    ) {
      newAction.setEffectiveTimeScale(speedRatio);
      return;
    }

    if (this.playingAnimationAction) {
      this.playingAnimationAction.fadeOut(transitionDuration);
    }

    newAction
      .reset()
      .setEffectiveTimeScale(speedRatio)
      .setLoop(loop ? LoopRepeat : LoopOnce, Infinity)
      .fadeIn(transitionDuration)
      .play();

    this.playingAnimationAction = newAction;
    this.isPlayingAnimationLooping = loop;
  }

  stopAllAnimations(): void {
    this._animationMixer?.stopAllAction();
    this.playingAnimationAction = undefined;
    this.isPlayingAnimationLooping = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  playInteraction(name: string, type: AvatarInteractionType): void {
    // TODO: update other avatar classes
    // this.interaction = new AvatarInteraction(this, name, type);
    // this.interaction.play(() => {
    //   this.interaction?.dispose();
    //   this.interaction = undefined;
    // });
    // this.isControlledByUser = true;
  }

  setNotControlledByUser(): void {
    this.isControlledByUser = false;
  }

  getForward(global?: boolean): Vector3 {
    if (global) {
      const worldForward = new Vector3(0, 0, -1);
      this.root.getWorldDirection(worldForward);
      return worldForward;
    }
    const forward = new Vector3(0, 0, -1);
    const worldQuat = this.root.getWorldQuaternion(new Quaternion());
    return forward.applyQuaternion(worldQuat);
  }

  getRight(global?: boolean): Vector3 {
    if (global) {
      const worldRight = new Vector3(1, 0, 0);
      this.root.getWorldDirection(worldRight);
      return worldRight;
    }
    const right = new Vector3(1, 0, 0);
    const worldQuat = this.root.getWorldQuaternion(new Quaternion());
    return right.applyQuaternion(worldQuat);
  }

  getPosition(global?: boolean): Vector3 {
    if (global) {
      const worldPos = new Vector3();
      this.root.getWorldPosition(worldPos);
      return worldPos;
    }
    return this.root.position;
  }

  getRotationQuaternion(global?: boolean): Quaternion {
    if (global) {
      const worldQuaternion = new Quaternion();
      this.root.getWorldQuaternion(worldQuaternion);
      return worldQuaternion;
    }
    return this.root.quaternion;
  }

  setPosition(position: Vector3): void {
    this.root.position.copy(position);
  }

  setRotationQuaternion(quaternion: Quaternion): void {
    this.root.quaternion.copy(quaternion);
  }

  show(_affectPhysicsBody: boolean = false): void {
    this._profile?.show();
    this.root.visible = true;
    if (clientSettings.DEBUG) {
      console.log("Show avatar for user:", this._participant.identity);
    }
  }

  hide(_affectPhysicsBody: boolean = false): void {
    this._profile?.hide();
    this.root.visible = false;
    if (clientSettings.DEBUG) {
      console.log("Hide avatar for user:", this._participant.identity);
    }
  }

  handleHeadRotationForAnimations(): void {
    // TODO_THREE: Implement custom bone look-at logic
  }
  limitHeadRotation(
    _minYaw: number = -Math.PI * 0.4,
    _maxYaw: number = Math.PI * 0.4,
    _minPitch: number = -Math.PI * 0.4,
    _maxPitch: number = Math.PI * 0.4
  ): void {
    // TODO_THREE: Implement custom bone look-at logic and apply limits
  }

  update(deltaTime: number): void {
    this._animationMixer?.update(deltaTime);
    // this._ik?.solve();
  }

  dispose(): void {
    if (this._pointerUpCooldown) clearTimeout(this._pointerUpCooldown);

    this._clearExistingAvatarData();

    deepDispose(this.root);

    // this.ikHandTargets.left.removeFromParent();
    // deepDispose(this.ikHandTargets.left);
    // this.ikHandTargets.right.removeFromParent();
    // deepDispose(this.ikHandTargets.right);

    this.root.removeFromParent();
    this.root = undefined!;
    this.customHeadNode.removeFromParent();
    this.customHeadNode = undefined!;

    // this._ikTargetTransforms = undefined!;

    this.rpmId = "";
    this.isLoadingAvatar = false;

    this._multiplayProfile?.dispose();
    this._profile?.dispose();

    this.root.removeFromParent();
  }
}

export default Avatar;
