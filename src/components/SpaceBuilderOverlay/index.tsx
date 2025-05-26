"use client";

import dynamic from "next/dynamic";
import { type FC } from "react";

import { type Category } from "@/components/SpaceBuilderOverlay/components/ItemsPanel";

const ItemsPanel = dynamic(() => import('@/components/SpaceBuilderOverlay/components/ItemsPanel'), {
    ssr: false,
});
const PlaceItemOverlay = dynamic(() => import('@/components/SpaceBuilderOverlay/components/PlaceItemOverlay'), {
    ssr: false,
});
const TransformMenu = dynamic(() => import('@/components/SpaceBuilderOverlay/components/TransformMenu'), {
    ssr: false,
});
// const PropertiesPanel = dynamic(() => import('@/components/SpaceBuilderOverlay/components/PropertiesPanel'), {
//     ssr: false,
// });

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
