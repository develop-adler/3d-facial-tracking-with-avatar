/* eslint-disable unicorn/prefer-export-from */

import IK from "./IK.js";
import IKChain from "./IKChain.js";
import IKJoint from "./IKJoint.js";
import IKBallConstraint from "./IKBallConstraint.js";
import IKHelper from "./IKHelper.js";

// If this is being included via script tag and using THREE
// globals, attach our exports to THREE.
if (
  globalThis.window !== undefined &&
  typeof globalThis.window.THREE === "object"
) {
  globalThis.window.THREE.IK = IK;
  globalThis.window.THREE.IKChain = IKChain;
  globalThis.window.THREE.IKJoint = IKJoint;
  globalThis.window.THREE.IKBallConstraint = IKBallConstraint;
  globalThis.window.THREE.IKHelper = IKHelper;
}

export { IK, IKChain, IKJoint, IKBallConstraint, IKHelper };
