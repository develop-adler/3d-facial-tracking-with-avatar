"use client";

import type { FC } from "react";

import { ActionButton, Container } from "./styles";

import { useLiveKitStore } from "@/stores/useLiveKitStore";
import { useStudioStore } from "@/stores/useStudioStore";

// type Props = {

// };

const PlaceItemOverlay: FC = () => {
    const spaceBuilder = useLiveKitStore((state) => state.spaceBuilder);
    const isPlacingObject = useStudioStore(state => state.isPlacingObject);

    // eslint-disable-next-line unicorn/no-null
    if (!spaceBuilder) return null;

    return (
        <Container>
            {isPlacingObject && <ActionButton
                onClick={() => {
                    spaceBuilder.objectPlacementHandler.placeObject();
                }}
            >
                Place Item
            </ActionButton>}
        </Container>
    );
};

export default PlaceItemOverlay;