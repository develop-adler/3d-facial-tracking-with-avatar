import { useEffect, useRef, useState, type FC } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Divider,
  Tooltip,
  Typography,
  Slider,
} from "@mui/material";

import type CoreScene from "@/3d/core/CoreScene";
import useAssets from "@/hooks/useAssets";
import { useSceneStore } from "@/stores/useSceneStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

import { COLOR } from "constant";

const BackgroundIntensitySlider: FC<{ coreScene?: CoreScene }> = ({
  coreScene,
}) => {
  const [intensity, setIntensity] = useState<number>(
    useLiveKitStore.getState().skyboxIntensity
  );
  const setSkyboxIntensity = useLiveKitStore(
    (state) => state.setSkyboxIntensity
  );

  const updateSkyboxIntensity = useRef<globalThis.NodeJS.Timeout | null>(null);

  const handleSliderChange = (_: Event, value: number | number[]) => {
    if (typeof value === "number") {
      setIntensity(value);
      coreScene?.atom.setSkyboxIntensity?.(value); // smooth update for 3D effect

      // Throttle store write
      if (updateSkyboxIntensity.current) {
        clearTimeout(updateSkyboxIntensity.current);
      }
      updateSkyboxIntensity.current = setTimeout(() => {
        setSkyboxIntensity(value);
      }, 150); // Delay in ms — tune this
    }
  };

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography sx={{ color: COLOR.white, fontSize: 14 }}>
          Intensity
        </Typography>
        <Typography sx={{ color: COLOR.white, fontSize: 14 }}>
          {intensity.toFixed(2)}
        </Typography>
      </Box>
      <Slider
        value={intensity}
        min={0.1}
        max={1}
        step={0.01}
        onChange={handleSliderChange}
        sx={{
          color: COLOR.brandPrimary,
          mb: 2,
        }}
      />
    </>
  );
};

const BackgroundModal: FC = () => {
  const modalRef = useRef<HTMLDivElement>(null);

  const { skyboxs } = useAssets();

  const coreScene = useSceneStore((state) => state.coreScene);
  const skyboxEnabled = useLiveKitStore((state) => state.skyboxEnabled);
  const setSkyboxEnabled = useLiveKitStore((state) => state.setSkyboxEnabled);
  const toggleChangeBackgroundModal = useLiveKitStore(
    (state) => state.toggleChangeBackgroundModal
  );

  const [anchorPosition] = useState<{
    top: number;
    left: number;
  }>(() => {
    const buttonEl = document.querySelector("#backgroundSettingsButton");
    if (!buttonEl) {
      return { top: 0, left: 0 }; // Default position if button not found
    }
    const rect = buttonEl.getBoundingClientRect();
    return { top: rect.top, left: rect.left };
  });

  // Close on outside click
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        toggleChangeBackgroundModal(false);
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      ref={modalRef}
      sx={{
        position: "fixed",
        top: `calc(${anchorPosition.top}px - 2rem)`,
        left: `calc(${anchorPosition.left}px)`,
        // offset
        transform: "translate(-25%, -100%)",
        userSelect: "none",
        zIndex: 1000,
        backgroundColor: COLOR.grayScaleBlack,
        width: 300,
        borderRadius: 4,
        p: 2,
        outline: "none",
      }}
    >
      {/* Upper Section - Buttons */}
      <Box
        display="flex"
        flexWrap="wrap"
        gap={1}
        justifyContent="center"
        mb={2}
      >
        {Object.values(skyboxs).map((asset, idx) => {
          const tooltipTitle = asset.title
            .replaceAll("_", " ")
            .replaceAll(/\b\w/g, (c) => c.toUpperCase());

          return (
            <Tooltip key={idx} placement="top" title={tooltipTitle}>
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
                  coreScene?.atom.loadHDRSkybox(
                    asset.id,
                    undefined,
                    undefined,
                    true
                  );
                }}
              >
                <Box
                  component="img"
                  src={
                    asset.thumbnail
                      ? "/static/" +
                      asset.thumbnail.split(".jpg")[0] +
                      "-128x128.jpg"
                      : ""
                  }
                  alt={asset.title}
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
          );
        })}
      </Box>

      {/* Divider */}
      <Divider sx={{ borderColor: "gray", borderStyle: "solid", my: 2 }} />

      <BackgroundIntensitySlider coreScene={coreScene} />

      {/* Lower Section - Checkbox */}
      <FormControlLabel
        control={
          <Checkbox
            color="default"
            sx={{ color: COLOR.brandPrimary }}
            checked={skyboxEnabled}
            onChange={(e) => {
              setSkyboxEnabled(e.target.checked);
              coreScene?.atom.toggleSkybox(e.target.checked);
            }}
          />
        }
        label="Enable background"
        labelPlacement="end"
      />
    </Box>
  );
};

export default BackgroundModal;
