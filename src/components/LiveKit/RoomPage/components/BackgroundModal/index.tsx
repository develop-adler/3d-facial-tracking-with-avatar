// BackgroundModal.tsx
import { useEffect, useRef, useState, type FC } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Divider,
} from "@mui/material";
import { COLOR } from "constant";
import { useSceneStore } from "@/stores/useSceneStore";
import { useLiveKitStore } from "@/stores/useLiveKitStore";

const buttonList = [
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
]; // Replace with your own list

const BackgroundModal: FC = () => {
  const modalRef = useRef<HTMLDivElement>(null);

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
        transform: 'translate(-25%, -100%)',
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
        {buttonList.map((label, idx) => (
          <Button
            key={idx}
            sx={{
              borderRadius: 2,
              minWidth: 60,
              height: 60,
              textTransform: "none",
              color: COLOR.white,
              backgroundColor: COLOR.brandPrimary,
            }}
          >
            {label}
          </Button>
        ))}
      </Box>

      {/* Divider */}
      <Divider sx={{ borderColor: "gray", borderStyle: "solid", my: 2 }} />

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
