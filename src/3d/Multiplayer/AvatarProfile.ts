import '@babylonjs/core/Animations/animatable';
import { Animation } from '@babylonjs/core/Animations/animation';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
// import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreatePolygon } from '@babylonjs/core/Meshes/Builders/polygonBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import earcut from 'earcut';

import type Avatar from '@/3d/Multiplayer/Avatar';
import { isAndroid } from '@/utils/browserUtils';
import { generateRandomId } from '@/utils/functionUtils';

import { clientSettings } from 'clientSettings';
import { COLOR } from 'constant';

import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { Nullable } from '@babylonjs/core/types';

class AvatarProfile {
    readonly avatar: Avatar;
    readonly scene: Scene;

    rootTransformNode: Nullable<TransformNode> = null;
    // profilePicture: Nullable<Mesh> = null;
    username: Mesh;
    chatBubble: Nullable<Mesh> = null;
    message: Nullable<Mesh> = null;

    clearMessageTimeout: Nullable<NodeJS.Timeout> = null;

    private _messageList: Array<string> = [];

    static readonly USERNAME_COLOR = '#ffffff';
    static readonly USERNAME_FONT_SIZE = 68;
    private static readonly USERNAME_PLANE_HEIGHT = 0.06;

    static readonly MESSAGE_LINE_CHARACTER_LIMIT = 22;
    static readonly MESSAGE_CHARACTER_LIMIT = 80;
    static readonly MESSAGE_DISPLAY_TIME_DEFAULT = 4;
    static readonly MESSAGE_DISPLAY_TIME_MAX = 25;
    static readonly MESSAGE_FONT_SIZE = 42;
    static readonly MESSAGE_FONT = 'Pretendard';
    static readonly MESSAGE_LINE_HEIGHT = 1.5 * AvatarProfile.MESSAGE_FONT_SIZE;
    static readonly MESSAGE_EMPTY_GAP_HEIGHT = 23;

    static readonly SEPARATOR_LINE_COLOR = '#898989';

    private static readonly PROFILE_CHAT_BUBBLE_WIDTH = 0.6;
    private static readonly PROFILE_CHAT_BUBBLE_HEIGHT_DEFAULT = 0.1;

    constructor(avatar: Avatar) {
        this.avatar = avatar;
        this.scene = avatar.scene;

        this.rootTransformNode = new TransformNode(
            'profileTransformNode_' + this.avatar.participant.identity,
            this.scene
        );
        this.rootTransformNode.billboardMode = 2; // BILLBOARDMODE_Y
        this.rootTransformNode.position.y = this.avatar.height * 1.125;

        this.rootTransformNode.parent = this.avatar.root;

        // this._createProfilePicture();
        this.username = this._createUsername();

        this.setProfileStyle('default');
    }

    // private async _createProfilePicture(): Promise<void> {
    //     this.profilePicture = CreateDisc(
    //         'userProfilePicture_' + this.avatar.participant.identity,
    //         { radius: 0.06, tessellation: 32 },
    //         this.scene
    //     );
    //     this.profilePicture.convertToUnIndexedMesh();
    //     this.profilePicture.isPickable = false;
    //     this.profilePicture.renderingGroupId = 1;
    //     this.profilePicture.occlusionType = 1; //AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
    //     // this.profilePicture.occlusionQueryAlgorithmType = 0; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_ACCURATE;
    //     this.profilePicture.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
    //     this.profilePicture.isOccluded = false;

    //     const profilePicMat = new StandardMaterial(
    //         'userProfilePictureMaterial_' + this.avatar.participant.identity,
    //         this.scene
    //     );

    //     this.avatar.highlightLayer?.addExcludedMesh(this.profilePicture);

    //     const loadDefaultProfilePic = () => {
    //         const texture = new Texture(
    //             '/static/imgs/defaultProfileAvatar.ktx2',
    //             this.scene,
    //             true,
    //             false,
    //             undefined,
    //             undefined,
    //             undefined,
    //             undefined,
    //             undefined,
    //             undefined,
    //             'image/ktx2',
    //             undefined,
    //             undefined,
    //             '.ktx2'
    //         );
    //         texture.optimizeUVAllocation = true;
    //         texture.isBlocking = false;
    //         profilePicMat.diffuseTexture = texture;
    //         profilePicMat.emissiveColor = Color3.White();
    //         profilePicMat.disableLighting = true;
    //         profilePicMat.freeze();
    //         this.profilePicture!.material = profilePicMat;
    //     };

    //     if (!this.avatar.participant?.image) {
    //         loadDefaultProfilePic();
    //         return;
    //     }

    //     try {
    //         const loadImageAsBlob = async (url: string) => {
    //             const res = await fetch(url);
    //             if (!res.ok) throw new Error('Failed to fetch profile image from url ' + url);
    //             return await res.blob();
    //         };

    //         const imageHandler = {
    //             // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //             get: async function (target: any, prop: string, receiver: any) {
    //                 if (prop === 'url') {
    //                     const imageUrl = target[prop];
    //                     try {
    //                         const blob = await loadImageAsBlob(imageUrl);
    //                         return blob;
    //                     } catch (error) {
    //                         console.error('Error fetching image:', error);
    //                         // throw error;
    //                     }
    //                 }
    //                 return Reflect.get(target, prop, receiver);
    //             },
    //         };
    //         const imageTarget = {
    //             url: this.avatar.participant.image,
    //         };
    //         const blobProxy = new Proxy(imageTarget, imageHandler);
    //         const blob = await blobProxy.url;

    //         const imageUrl = URL.createObjectURL(blob);
    //         const texture = new Texture(imageUrl, this.scene, true, false);
    //         texture.optimizeUVAllocation = true;
    //         texture.isBlocking = false;
    //         profilePicMat.diffuseTexture = texture;
    //         profilePicMat.emissiveColor = Color3.White();
    //         profilePicMat.disableLighting = true;
    //         profilePicMat.freeze();
    //         this.profilePicture!.material = profilePicMat;
    //     } catch (e) {
    //         loadDefaultProfilePic();
    //     }
    // }

    /**
     * Set profile picture and username to fit bubble chat
     */
    setProfileStyle(style: 'default' | 'bubble'): void {
        // if (!this.profilePicture) this._createProfilePicture();

        if (style === 'default') {
            this.username.setEnabled(true);

            // // set profile picture
            // this.profilePicture!.parent = null;
            // this.profilePicture!.rotation.setAll(0);
            // this.profilePicture!.position.set(0, this.avatar.gender === 'male' ? 0.03 : 0, 0);
            // this.profilePicture!.parent = this.rootTransformNode;
        } else {
            this.username.setEnabled(false);

            // // set profile picture position
            // this.profilePicture!.parent = null;
            // this.profilePicture!.rotation.x = Math.PI * 0.5;

            // const profilePictureSize = this.profilePicture!.getBoundingInfo().boundingBox.extendSize;

            // // align right edge of profile picture to left edge of chat bubble with a small gap
            // this.profilePicture!.position.x = -chatBubbleSize.x - profilePictureSize.x - 0.03;

            // // align top edge of profile picture to top edge of chat bubble
            // this.profilePicture!.position.z = chatBubbleSize.z - profilePictureSize.y;

            // this.profilePicture!.parent = this.chatBubble;
        }
    }

    private _createUsername(): Mesh {
        const tempFont = `normal ${AvatarProfile.USERNAME_FONT_SIZE}px ${AvatarProfile.MESSAGE_FONT}`;

        // Set height for dynamic texture
        const DTHeight = 1 * AvatarProfile.USERNAME_FONT_SIZE;
        const ratio = AvatarProfile.USERNAME_PLANE_HEIGHT / DTHeight;

        //Use a temporay dynamic texture to calculate the length of the text on the dynamic texture canvas
        const tempDT = new DynamicTexture('tempDynamicTexture', 64, this.scene);
        const dtContext = tempDT.getContext();
        dtContext.font = tempFont;
        const DTWidth = dtContext.measureText(this.avatar.participant.identity).width;
        tempDT.dispose();

        // Calculate width the plane has to be
        const planeWidth = DTWidth * ratio;

        const font = `normal 36vh ${AvatarProfile.MESSAGE_FONT}`;

        let plane;

        if (isAndroid()) {
            plane = CreatePlane(
                'usernamePlaneMesh_' + this.avatar.participant.identity,
                {
                    width: planeWidth,
                    height: planeWidth,
                },
                this.scene
            );

            const usernameTexture = new DynamicTexture(
                'avatarInfoTexture_' + this.avatar.participant.identity,
                2048,
                this.scene
            );
            usernameTexture.hasAlpha = true;
            usernameTexture.drawText(
                this.avatar.participant.identity,
                null,
                null,
                font,
                AvatarProfile.USERNAME_COLOR,
                null,
                true
            );
            const material = new StandardMaterial(
                'usernamePlaneMaterial_' + this.avatar.participant.identity,
                this.scene
            );
            material.diffuseTexture = usernameTexture;
            material.disableLighting = true;
            material.emissiveColor = Color3.White();
            plane.material = material;
        } else {
            const widthHeightRatio = planeWidth / AvatarProfile.USERNAME_PLANE_HEIGHT;
            plane = CreatePlane(
                'usernamePlaneMesh_' + this.avatar.participant.identity,
                {
                    width: planeWidth,
                    height: AvatarProfile.USERNAME_PLANE_HEIGHT,
                },
                this.scene
            );
            const advancedTexture = AdvancedDynamicTexture.CreateForMesh(
                plane,
                1024 * widthHeightRatio,
                1024,
                false
            );
            const text = new TextBlock(`textBlock_${this.avatar.participant.identity}`, this.avatar.participant.identity);
            text.color = 'white';
            text.fontSize = 850;
            text.fontFamily = AvatarProfile.MESSAGE_FONT;
            text.shadowColor = 'black';
            text.shadowBlur = 50;
            text.textWrapping = false;
            advancedTexture.background = 'transparent';
            advancedTexture.addControl(text);
        }

        plane.convertToUnIndexedMesh();
        plane.isPickable = false;
        plane.renderingGroupId = 2;
        plane.occlusionType = 1; //AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
        // plane.occlusionQueryAlgorithmType = 0; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_ACCURATE;
        plane.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
        plane.isOccluded = false;

        // set username position and scaling
        plane.parent = null;
        plane.rotation.setAll(0);
        plane.position.y = this.avatar.gender === 'male' ? -0.09 : -0.13;
        plane.scaling.setAll(2.5);
        plane.parent = this.rootTransformNode;

        // this.avatar.highlightLayer?.addExcludedMesh(this.username);

        return plane;
    }

    private _createChatBubble(width: number, height: number): Mesh {
        const radius = 0.06;
        const dTheta = Math.PI / 32;

        // ============ Create polygon shape for chat bubble ============ //
        // Polygon shape in X0Z plane, meaning Y is 0
        const shape = [];

        let extendX = -(0.5 * width - radius);
        let extendZ = -(0.5 * height - radius);
        const bottomZ = extendZ + radius * Math.sin(1.5 * Math.PI);
        const centerX = (-(0.5 * width - radius) + (0.5 * width - radius)) / 2;

        // bottom left corner
        for (let theta = Math.PI; theta <= 1.5 * Math.PI; theta += dTheta) {
            shape.push(
                new Vector3(extendX + radius * Math.cos(theta), 0, extendZ + radius * Math.sin(theta))
            );
        }

        // extruding triangle in the bottom center
        shape.push(new Vector3(centerX - 0.02, 0, bottomZ));
        shape.push(new Vector3(centerX, 0, bottomZ - 0.025));
        shape.push(new Vector3(centerX + 0.02, 0, bottomZ));

        // bottom right corner
        extendX = 0.5 * width - radius;
        for (let theta = 1.5 * Math.PI; theta <= 2 * Math.PI; theta += dTheta) {
            shape.push(
                new Vector3(extendX + radius * Math.cos(theta), 0, extendZ + radius * Math.sin(theta))
            );
        }

        // top right corner
        extendZ = 0.5 * height - radius;
        for (let theta = 0; theta <= 0.5 * Math.PI; theta += dTheta) {
            shape.push(
                new Vector3(extendX + radius * Math.cos(theta), 0, extendZ + radius * Math.sin(theta))
            );
        }

        // top left corner
        extendX = -(0.5 * width - radius);
        extendZ = 0.5 * height - radius;
        for (let theta = 0.5 * Math.PI; theta <= Math.PI; theta += dTheta) {
            shape.push(
                new Vector3(extendX + radius * Math.cos(theta), 0, extendZ + radius * Math.sin(theta))
            );
        }
        // ============ End of polygon shape creation ============ //

        const polygon = CreatePolygon(
            'polygon_' + this.avatar.participant.identity,
            { shape: shape },
            this.scene,
            earcut
        );
        polygon.rotate(Vector3.Right(), -Math.PI * 0.5);

        const textPlaneBackgroundMaterial = new StandardMaterial(
            'infoPlaneBackgroundMaterial_' + this.avatar.participant.identity,
            this.scene
        );
        textPlaneBackgroundMaterial.emissiveColor = this.avatar.isSelf
            ? Color3.FromHexString(COLOR.grayScale99)
            : Color3.FromHexString(COLOR.grayScale17);
        textPlaneBackgroundMaterial.alpha = 1;
        textPlaneBackgroundMaterial.disableLighting = true;
        polygon.material = textPlaneBackgroundMaterial;

        // optimize mesh
        polygon.material.freeze();
        polygon.convertToUnIndexedMesh();
        polygon.isPickable = false;
        polygon.renderingGroupId = 1;
        polygon.occlusionType = 1; //AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
        // polygon.occlusionQueryAlgorithmType = 0; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_ACCURATE;
        polygon.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
        polygon.isOccluded = false;

        polygon.parent = this.rootTransformNode;

        // this.avatar.highlightLayer?.addExcludedMesh(this.chatBubble);

        return polygon;
    }

    private _createMessage(
        id: string,
        dynamicTexture: DynamicTexture,
        width: number,
        height: number
    ): void {
        this.message = CreatePlane(
            'avatarMessagePlaneMesh_' + id,
            {
                width: width,
                height: height,
            },
            this.scene
        );

        const textPlaneMaterial = new StandardMaterial('messagePlaneMaterial_' + id, this.scene);
        textPlaneMaterial.disableLighting = true;
        textPlaneMaterial.emissiveColor = Color3.White();
        textPlaneMaterial.diffuseTexture = dynamicTexture;
        textPlaneMaterial.freeze();
        this.message.material = textPlaneMaterial;

        // optimize mesh
        this.message.convertToUnIndexedMesh();
        this.message.isPickable = false;
        this.message.renderingGroupId = 2;
        this.message.occlusionType = 1; //AbstractMesh.OCCLUSION_TYPE_OPTIMISTIC;
        // this.message.occlusionQueryAlgorithmType = 0; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_ACCURATE;
        this.message.occlusionQueryAlgorithmType = 1; // AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
        this.message.isOccluded = false;

        this.message.parent = this.rootTransformNode;

        // offset message down a bit for Y padding
        this.message.position.y = -0.02;

        // position message in front of bubble
        this.message.position.z -= 0.01;

        // this.avatar.highlightLayer?.addExcludedMesh(this.message);
    }

    printMessage(message: string): void {
        // dispose existing message
        this.message?.dispose(false, true);

        // trim whitespace
        let processedMessage = message.trim();

        // truncate message if it exceeds the character limit
        if (processedMessage.length > AvatarProfile.MESSAGE_CHARACTER_LIMIT) {
            processedMessage = processedMessage.substring(0, AvatarProfile.MESSAGE_CHARACTER_LIMIT);
        }

        if (this._messageList.length === 3) {
            this._messageList.pop();
        }
        this._messageList.unshift(processedMessage);

        const messageArray: string[] = [];

        // reverse loop to display messages in order
        for (let i = this._messageList.length - 1; i >= 0; i--) {
            const message = this._messageList[i];

            // process message, if string is longer than line character limit, find the ' '
            // closest to the left of the character limit, then split the string there
            // and repeat until end of string and store the parts in an array
            if (message.length > AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT) {
                // Explanation: split the message into parts that are less than the character limit
                // If the message is longer than the line limit, split it into parts.
                let messagePart = message;
                while (messagePart.length > 0) {
                    if (messagePart.length > AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT) {
                        let splitIndex = messagePart.lastIndexOf(
                            ' ',
                            AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT
                        );

                        // if space is not found or is at index >= than the character limit,
                        // split at the character limit
                        if (splitIndex >= AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT || splitIndex === -1) {
                            splitIndex = AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT;
                        }

                        // push part of message into array as 1 line
                        messageArray.push(messagePart.substring(0, splitIndex));

                        // get next part of message
                        messagePart = messagePart.substring(splitIndex + 1);
                    } else {
                        messageArray.push(messagePart);
                        messagePart = '';
                    }
                }
            } else {
                messageArray.push(message);
            }

            if (i > 0) messageArray.push('');
        }

        const font = `normal 6vh ${AvatarProfile.MESSAGE_FONT}`;

        let chatBubbleHeight = AvatarProfile.MESSAGE_LINE_HEIGHT;
        for (const text of messageArray) {
            if (text === '') {
                chatBubbleHeight += AvatarProfile.MESSAGE_EMPTY_GAP_HEIGHT;
                continue;
            }
            chatBubbleHeight += AvatarProfile.MESSAGE_LINE_HEIGHT;
        }

        const messageId = generateRandomId();

        // ========== Create dynamic texture to draw text ========== //
        const dynamicTexture = new DynamicTexture('textDynamicTexture_' + messageId, 2048, this.scene);
        dynamicTexture.hasAlpha = true;

        // get width of longest text line to fit all texts
        // within the dynamic texture and prevent clipping
        const dtContext = dynamicTexture.getContext();
        dtContext.font = font;
        let longestLineWidth = 0;
        for (const text of messageArray) {
            const textWidth = dtContext.measureText(text).width;
            if (textWidth > longestLineWidth) longestLineWidth = textWidth;
        }

        // scale dynamic texture to fit all text
        dynamicTexture.scaleTo(longestLineWidth, chatBubbleHeight);

        // print line by line
        let labelY = AvatarProfile.MESSAGE_LINE_HEIGHT;
        dynamicTexture.drawText('', 0, 0, font, COLOR.black, null, true, true);
        for (const text of messageArray) {
            if (text === '') {
                labelY += AvatarProfile.MESSAGE_EMPTY_GAP_HEIGHT;
                continue;
            }
            dynamicTexture.drawText(
                text,
                0,
                labelY,
                font,
                this.avatar.isSelf ? 'black' : 'white',
                null,
                true,
                true
            );
            labelY += AvatarProfile.MESSAGE_LINE_HEIGHT;
        }
        // ========== End of dynamic texture creation ========== //

        const heightForMessagePlane = chatBubbleHeight * 0.001;
        const widthForMessagePlane = longestLineWidth * 0.001;

        // set correct height for chat bubble based on message length
        const messageAreaHeight = AvatarProfile.PROFILE_CHAT_BUBBLE_HEIGHT_DEFAULT - 0.02;

        // calculate bubble width and height based on message length
        const bubbleHeight =
            heightForMessagePlane <= messageAreaHeight
                ? AvatarProfile.PROFILE_CHAT_BUBBLE_HEIGHT_DEFAULT
                : heightForMessagePlane;

        const bubbleWidth =
            widthForMessagePlane <= AvatarProfile.PROFILE_CHAT_BUBBLE_WIDTH
                ? AvatarProfile.PROFILE_CHAT_BUBBLE_WIDTH
                : widthForMessagePlane + AvatarProfile.PROFILE_CHAT_BUBBLE_WIDTH * 0.2;

        // dispose existing chat bubble, don't dispose children
        this.chatBubble?.dispose(true, true);
        // Create chat bubble for avatar
        this.chatBubble = this._createChatBubble(bubbleWidth, bubbleHeight);

        // set style for profile picture and username
        this.setProfileStyle('bubble');

        // Create message plane
        this._createMessage(
            messageId,
            dynamicTexture,
            widthForMessagePlane,
            heightForMessagePlane
        );

        // Handle message display time
        if (this.clearMessageTimeout !== null) {
            clearTimeout(this.clearMessageTimeout);
            this.clearMessageTimeout = null;
        }

        // display time is proportional to the length of the message
        let messageDisplayTime = AvatarProfile.MESSAGE_DISPLAY_TIME_DEFAULT * 1000;

        // get total characters in all message (don't count white space)
        const totalCharacters = messageArray.reduce((acc, val) => acc + val.length, 0);

        // calculate display time based on character count
        messageDisplayTime = Math.min(
            messageDisplayTime + totalCharacters * 200,
            AvatarProfile.MESSAGE_DISPLAY_TIME_MAX * 1000
        );

        this.clearMessageTimeout = setTimeout(() => {
            if (this.message) {
                this.fadeMesh(this.message, () => {
                    if (!this.rootTransformNode || this.rootTransformNode.isDisposed()) return;

                    this.message?.dispose(false, true);
                    this.setProfileStyle('default');

                    // clear messages
                    this._messageList = [];
                });
            }
            if (this.chatBubble) {
                this.fadeMesh(this.chatBubble, () => {
                    if (!this.rootTransformNode || this.rootTransformNode.isDisposed()) return;

                    this.chatBubble?.dispose(false, true);
                    this.setProfileStyle('default');
                });
            }
            this.clearMessageTimeout = null;
        }, messageDisplayTime);

        if (clientSettings.DEBUG) {
            console.log('Message printed:', processedMessage);
        }
    }

    fadeMesh(mesh: Mesh, endAnimCallback?: () => void): void {
        const fadeAnimation = new Animation(
            'fadeAnimation',
            'visibility',
            30,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CYCLE
        );
        const keys = [
            {
                frame: 0,
                value: 1,
            },
            {
                frame: 45,
                value: 0,
            },
        ];
        fadeAnimation.setKeys(keys);
        mesh.animations.push(fadeAnimation);
        this.scene.beginAnimation(mesh, 0, 45, false, 1, endAnimCallback);
    }

    show(): void {
        this.rootTransformNode?.setEnabled(true);
    }
    hide(): void {
        this.rootTransformNode?.setEnabled(false);
    }
    dispose(): void {
        this.scene.blockfreeActiveMeshesAndRenderingGroups = true;

        this.rootTransformNode?.dispose(false, true);
        this.rootTransformNode = null;
        // this.profilePicture?.dispose(false, true);
        // this.profilePicture = null;
        this.username.dispose(false, true);
        this.message?.dispose(false, true);
        this.message = null;
        this.chatBubble?.dispose(false, true);
        this.chatBubble = null;

        this.scene.blockfreeActiveMeshesAndRenderingGroups = false;
    }
}

export default AvatarProfile;
