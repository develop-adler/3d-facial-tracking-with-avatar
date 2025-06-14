import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
  type Scene,
} from "three";
import type Avatar from "@/3dthree/avatar/Avatar";
import { clientSettings } from "clientSettings";
import { COLOR } from "constant";

class AvatarProfile {
  readonly avatar: Avatar;
  readonly scene: Scene;
  readonly rootTransformNode: Group;
  username: Mesh;
  chatBubble?: Mesh;
  message?: Mesh;
  clearMessageTimeout?: globalThis.NodeJS.Timeout;
  private _messageList: Array<string> = [];

  static readonly USERNAME_COLOR = "#ffffff";
  static readonly USERNAME_FONT_SIZE = 68;
  private static readonly USERNAME_PLANE_HEIGHT = 0.06;

  static readonly MESSAGE_LINE_CHARACTER_LIMIT = 22;
  static readonly MESSAGE_CHARACTER_LIMIT = 80;
  static readonly MESSAGE_DISPLAY_TIME_DEFAULT = 4;
  static readonly MESSAGE_DISPLAY_TIME_MAX = 25;
  static readonly MESSAGE_FONT_SIZE = 42;
  static readonly MESSAGE_FONT = "Pretendard";
  static readonly MESSAGE_LINE_HEIGHT = 1.5 * AvatarProfile.MESSAGE_FONT_SIZE;
  static readonly MESSAGE_EMPTY_GAP_HEIGHT = 23;

  // static readonly SEPARATOR_LINE_COLOR = COLOR.grayScale60;

  private static readonly PROFILE_CHAT_BUBBLE_WIDTH = 0.6;
  private static readonly PROFILE_CHAT_BUBBLE_HEIGHT_DEFAULT = 0.1;

  constructor(avatar: Avatar) {
    this.avatar = avatar;
    this.scene = avatar.scene;

    this.rootTransformNode = new Group();
    this.rootTransformNode.name = "profileTransformNode_" + this.avatar.participant.identity;
    this.rootTransformNode.position.y = this.avatar.height * 1.125;
    this.rootTransformNode.parent = this.avatar.root;

    this.username = this._createUsername();
  }

  // This should be called in the main render loop to ensure it always faces the camera
  update(): void {
    if (this.rootTransformNode.visible) {
      // Billboard Y-axis only
      const cameraPosition = new Vector3();
      this.avatar.coreScene.camera.getWorldPosition(cameraPosition);
      this.rootTransformNode.lookAt(cameraPosition.x, this.rootTransformNode.position.y, cameraPosition.z);
    }
  }

  private _createUsername(): Mesh {
    const text = this.avatar.participant.identity;
    const fontSize = 64;
    const font = `bold ${fontSize}px ${AvatarProfile.MESSAGE_FONT}`;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    context.font = font;
    const textMetrics = context.measureText(text);

    const canvasWidth = textMetrics.width + 20; // Add some padding
    const canvasHeight = fontSize * 1.5;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Redraw text on resized canvas
    context.font = font;
    context.fillStyle = "white";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "black";
    context.shadowBlur = 10;
    context.fillText(text, canvasWidth / 2, canvasHeight / 2);

    const texture = new CanvasTexture(canvas);
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
    });

    const planeHeight = 0.1;
    const planeWidth = planeHeight * (canvasWidth / canvasHeight);
    const geometry = new PlaneGeometry(planeWidth, planeHeight);
    const plane = new Mesh(geometry, material);
    plane.name = "usernamePlaneMesh_" + this.avatar.participant.identity;

    plane.position.y = this.avatar.gender === "male" ? -0.09 : -0.13;
    this.rootTransformNode.add(plane);

    return plane;
  }

  private _createChatBubble(width: number, height: number): Mesh {
    const radius = 0.06;
    const shape = new Shape();
    const halfW = width / 2;
    const halfH = height / 2;

    // Start at top-left, move clockwise
    shape.moveTo(-halfW + radius, halfH);
    shape.lineTo(halfW - radius, halfH);
    shape.absarc(halfW - radius, halfH - radius, radius, Math.PI / 2, 0, true); // Top-right corner
    shape.lineTo(halfW, -halfH + radius);
    shape.absarc(halfW - radius, -halfH + radius, radius, 0, -Math.PI / 2, true); // Bottom-right corner

    // Add triangle at bottom
    shape.lineTo(0.02, -halfH);
    shape.lineTo(0, -halfH - 0.025);
    shape.lineTo(-0.02, -halfH);

    shape.lineTo(-halfW + radius, -halfH);
    shape.absarc(-halfW + radius, -halfH + radius, radius, -Math.PI / 2, Math.PI, true); // Bottom-left corner
    shape.lineTo(-halfW, halfH - radius);
    shape.absarc(-halfW + radius, halfH - radius, radius, Math.PI, Math.PI / 2, true); // Top-left corner

    const geometry = new ShapeGeometry(shape);
    const material = new MeshBasicMaterial({
      color: this.avatar.isSelf ? COLOR.grayScale99 : COLOR.grayScale17,
      transparent: true,
      opacity: 0.9,
    });

    const bubble = new Mesh(geometry, material);
    bubble.name = "chatBubble_" + this.avatar.participant.identity;
    this.rootTransformNode.add(bubble);
    return bubble;
  }

  printMessage(message: string): void {
    // dispose existing message
    this.message?.dispose(false, true);

    // trim whitespace
    let processedMessage = message.trim();

    // truncate message if it exceeds the character limit
    if (processedMessage.length > AvatarProfile.MESSAGE_CHARACTER_LIMIT) {
      processedMessage = processedMessage.slice(
        0,
        Math.max(0, AvatarProfile.MESSAGE_CHARACTER_LIMIT)
      );
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
              " ",
              AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT
            );

            // if space is not found or is at index >= than the character limit,
            // split at the character limit
            if (
              splitIndex >= AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT ||
              splitIndex === -1
            ) {
              splitIndex = AvatarProfile.MESSAGE_LINE_CHARACTER_LIMIT;
            }

            // push part of message into array as 1 line
            messageArray.push(messagePart.slice(0, Math.max(0, splitIndex)));

            // get next part of message
            messagePart = messagePart.slice(Math.max(0, splitIndex + 1));
          } else {
            messageArray.push(messagePart);
            messagePart = "";
          }
        }
      } else {
        messageArray.push(message);
      }

      if (i > 0) messageArray.push("");
    }

    const font = `normal 6vh ${AvatarProfile.MESSAGE_FONT}`;

    let chatBubbleHeight = AvatarProfile.MESSAGE_LINE_HEIGHT;
    for (const text of messageArray) {
      if (text === "") {
        chatBubbleHeight += AvatarProfile.MESSAGE_EMPTY_GAP_HEIGHT;
        continue;
      }
      chatBubbleHeight += AvatarProfile.MESSAGE_LINE_HEIGHT;
    }

    const messageId = v4();

    // ========== Create dynamic texture to draw text ========== //
    const dynamicTexture = new DynamicTexture(
      "textDynamicTexture_" + messageId,
      2048,
      this.scene
    );
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
    // eslint-disable-next-line unicorn/no-null
    dynamicTexture.drawText("", 0, 0, font, COLOR.black, null, true, true);
    for (const text of messageArray) {
      if (text === "") {
        labelY += AvatarProfile.MESSAGE_EMPTY_GAP_HEIGHT;
        continue;
      }
      dynamicTexture.drawText(
        text,
        0,
        labelY,
        font,
        this.avatar.isSelf ? "black" : "white",
        // eslint-disable-next-line unicorn/no-null
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
    const messageAreaHeight =
      AvatarProfile.PROFILE_CHAT_BUBBLE_HEIGHT_DEFAULT - 0.02;

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
    this.setProfileStyle("bubble");

    // Create message plane
    this._createMessage(
      messageId,
      dynamicTexture,
      widthForMessagePlane,
      heightForMessagePlane
    );

    // Handle message display time
    if (this.clearMessageTimeout) {
      clearTimeout(this.clearMessageTimeout);
      this.clearMessageTimeout = undefined;
    }

    // display time is proportional to the length of the message
    let messageDisplayTime = AvatarProfile.MESSAGE_DISPLAY_TIME_DEFAULT * 1000;

    // get total characters in all message (don't count white space)
    const totalCharacters = messageArray.reduce(
      (acc, val) => acc + val.length,
      0
    );

    // calculate display time based on character count
    messageDisplayTime = Math.min(
      messageDisplayTime + totalCharacters * 200,
      AvatarProfile.MESSAGE_DISPLAY_TIME_MAX * 1000
    );

    this.clearMessageTimeout = setTimeout(() => {
      if (this.message) {
        this.fadeMesh(this.message, () => {
          if (!this.rootTransformNode || this.rootTransformNode.isDisposed())
            return;

          this.message?.dispose(false, true);
          this.setProfileStyle("default");

          // clear messages
          this._messageList = [];
        });
      }
      if (this.chatBubble) {
        this.fadeMesh(this.chatBubble, () => {
          if (!this.rootTransformNode || this.rootTransformNode.isDisposed())
            return;

          this.chatBubble?.dispose(false, true);
          this.setProfileStyle("default");
        });
      }
      this.clearMessageTimeout = undefined;
    }, messageDisplayTime);

    if (clientSettings.DEBUG) {
      console.log("Message printed:", processedMessage);
    }
  }

  // ... (printMessage logic remains largely the same, but _createMessage needs to be adapted)

  dispose(): void {
    this.rootTransformNode.removeFromParent();
    // Traverse and dispose all materials and geometries
  }
}

export default AvatarProfile;
