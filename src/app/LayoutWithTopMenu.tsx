"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

// import { TopMenu } from "@/components/TopMenu";

const TopMenu = dynamic(() => import('@/components/TopMenu').then(p => p.TopMenu), { ssr: false });

export default function LayoutWithTopMenu({
    children,
}: {
    readonly children: ReactNode;
}) {
    return (
        <>
            <TopMenu />
            {children}
        </>
    );
}
