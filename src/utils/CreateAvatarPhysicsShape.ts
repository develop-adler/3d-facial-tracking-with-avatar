import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    PhysicsShapeCapsule,
    PhysicsShapeContainer,
    PhysicsShapeCylinder,
    PhysicsShapeSphere,
} from "@babylonjs/core/Physics/v2/physicsShape";

import type { AvatarGender } from "@/models/3d";

import { AVATAR_PARAMS, PHYSICS_SHAPE_FILTER_GROUPS } from "constant";

import type { Scene } from "@babylonjs/core/scene";

const CreateAvatarPhysicsShape = (
    scene: Scene,
    gender: AvatarGender,
    isShort: boolean = false
): PhysicsShapeContainer | PhysicsShapeSphere => {
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
};

export default CreateAvatarPhysicsShape;