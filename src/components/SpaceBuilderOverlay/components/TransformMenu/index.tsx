"use client";

import Image from "next/image";
import { type FC, type MouseEvent, useEffect } from "react";

import * as S from "./styles";

import type { GizmoTransformationType } from "@/models/3d";
import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useStudioStore } from "@/stores/useStudioStore";

// import studioDuplicateIcon from '#/static/icons/studioDuplicateIcon.svg';
import StudioMoveIcon from "#/static/icons/studioMoveIcon.svg";
// import StudioPanIcon from '#/static/icons/studioPanIcon.svg';
import StudioRotateIcon from "#/static/icons/studioRotateIcon.svg";
import StudioScaleIcon from "#/static/icons/studioScaleIcon.svg";

const TransformMenu: FC = () => {
    const selectedObject = useStudioStore(
        (state) => state.selectedObject
    );
    const currentGizmoTransformationType = useStudioStore(
        (state) => state.currentGizmoTransformationType
    );
    const setGizmoTransformationType = useStudioStore(
        (state) => state.setGizmoTransformationType
    );

    const spaceBuilder = useLiveKitStore((state) => state.spaceBuilder);

    const MenuItemsList = [
        {
            id: "location",
            title: "Location",
            icon: StudioMoveIcon,
            properties: {
                height: 3.125,
                left: -2,
            },
        },
        {
            id: "rotation",
            title: "Rotation",
            icon: StudioRotateIcon,
            properties: {
                height: 6.4375,
                left: -2,
            },
        },
        {
            id: "scale",
            title: "Scale",
            icon: StudioScaleIcon,
            properties: {
                height: 9.3125,
                left: -1.8,
            },
        },
        // {
        //     id: 'duplicate',
        //     title: "Duplicate",
        //     icon: studioDuplicateIcon,
        //     properties: {
        //         height: 3.125,
        //         left: -1.8,
        //     },
        // },
    ];

    const handleMenuItemSelection = (e: MouseEvent<HTMLDivElement>) => {
        if (
            e.currentTarget.id === "duplicate" &&
            selectedObject !== null
        ) {
            spaceBuilder?.duplicateObjects(selectedObject);
            return;
        }
        setGizmoTransformationType(e.currentTarget.id as GizmoTransformationType);
    };

    useEffect(() => {
        spaceBuilder?.gizmoHandler.setGizmoType(currentGizmoTransformationType);
    }, [spaceBuilder, currentGizmoTransformationType]);

    // eslint-disable-next-line unicorn/no-null
    if (!selectedObject) return null;

    return (
        <S.MenuItemsBackground>
            <S.MenuItemsContainer>
                {MenuItemsList.map((item) => {
                    return (
                        <S.MenuItemButton
                            key={item.id}
                            id={item.id}
                            isSelected={currentGizmoTransformationType === item.id}
                            onClick={handleMenuItemSelection}
                        >
                            <S.MenuItemIcon>
                                <Image
                                    src={item.icon}
                                    alt={item.title + " icon"}
                                    onContextMenu={(e) => e.preventDefault()}
                                />
                            </S.MenuItemIcon>
                        </S.MenuItemButton>
                    );
                })}
            </S.MenuItemsContainer>
        </S.MenuItemsBackground>
    );
};

export default TransformMenu;
