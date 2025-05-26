"use client";

import { ComponentProps, memo, type FC } from "react";

import { Box, Button, Grid, Tooltip } from "@mui/material";

import type { Asset } from "@/models/common";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

type Props = {
  item: Asset;
} & ComponentProps<typeof Button>;

const ItemButton: FC<Props> = ({ item, ...buttonProps }) => {
    const spaceBuilder = useLiveKitStore(state => state.spaceBuilder);

    const tooltipTitle = item.title
        .split("_")
        .slice(1)
        .join(" ")
        .replaceAll("_", " ")
        .replaceAll(/\b\w/g, (c) => c.toUpperCase());

    return (
        <Grid component="div" key={item.id}>
            <Tooltip disableInteractive title={tooltipTitle} placement="bottom">
                <Button
                    variant="text"
                    sx={{
                        borderRadius: 2,
                        padding: 0,
                        width: "32px",
                        height: "auto",
                        aspectRatio: "1",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        overflow: "hidden",
                        userSelect: "none",
                    }}
                    onClick={() => {
                        spaceBuilder?.objectPlacementHandler.loadGhostPreviewObject(item);
                    }}
                    {...buttonProps}
                >
                    <Box
                        component="img"
                        src={
                            item.thumbnail
                                ? "/static/" + item.thumbnail.split(".jpg")[0] + "-128x128.jpg"
                                : ""
                        }
                        alt={item.title}
                        sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: 2,
                        }}
                        onDrag={(event) => event.preventDefault()}
                        onDragStart={(event) => event.preventDefault()}
                    />
                </Button>
            </Tooltip>
        </Grid>
    );
};

export default memo(ItemButton);
