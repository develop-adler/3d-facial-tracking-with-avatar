"use client";

import { type FC } from "react";

import ItemsPanel, { type Category } from "@/components/SpaceBuilderOverlay/components/ItemsPanel";
import PlaceItemOverlay from "@/components/SpaceBuilderOverlay/components/PlaceItemOverlay";
import TransformMenu from "@/components/SpaceBuilderOverlay/components/TransformMenu";
// import PropertiesPanel from "@/components/SpaceBuilderOverlay/components/PropertiesPanel";

type Props = {
    categories?: Category[];
};

const SpaceBuilderOverlay: FC<Props> = ({ categories }) => {
    return (
        <>
            <ItemsPanel categories={categories} />
            <TransformMenu />
            {/* <PropertiesPanel /> */}
            <PlaceItemOverlay />
        </>
    )
};

export default SpaceBuilderOverlay;
