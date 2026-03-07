import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  Text,
  PanResponder,
  Dimensions,
  Modal,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const HANDLE_SIZE = 28;
const MIN_CROP_PX = 60; // minimum crop dimension in display pixels
const BOTTOM_BAR_H = 120;
const IMAGE_AREA_H = SCREEN_H - BOTTOM_BAR_H;

interface CropModalProps {
  visible: boolean;
  imageUri: string;
  onCrop: (croppedUri: string) => void;
  onCancel: () => void;
}

interface DisplayInfo {
  scale: number;
  offsetX: number;
  offsetY: number;
  displayW: number;
  displayH: number;
}

interface CropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function CropModal({
  visible,
  imageUri,
  onCrop,
  onCancel,
}: CropModalProps) {
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [displayInfo, setDisplayInfo] = useState<DisplayInfo | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [applying, setApplying] = useState(false);

  // Refs avoid stale closures inside PanResponder callbacks
  const cropRef = useRef<CropRect | null>(null);
  const displayRef = useRef<DisplayInfo | null>(null);

  useEffect(() => {
    if (!visible || !imageUri) return;
    setImageDims(null);
    setCropRect(null);
    setApplying(false);

    Image.getSize(
      imageUri,
      (w, h) => {
        const scale = Math.min(SCREEN_W / w, IMAGE_AREA_H / h);
        const displayW = w * scale;
        const displayH = h * scale;
        const offsetX = (SCREEN_W - displayW) / 2;
        const offsetY = (IMAGE_AREA_H - displayH) / 2;

        const info: DisplayInfo = { scale, offsetX, offsetY, displayW, displayH };
        const initial: CropRect = {
          left: offsetX,
          top: offsetY,
          right: offsetX + displayW,
          bottom: offsetY + displayH,
        };

        setImageDims({ w, h });
        setDisplayInfo(info);
        setCropRect(initial);
        cropRef.current = initial;
        displayRef.current = info;
      },
      () => {
        // Fallback when getSize fails
        const info: DisplayInfo = {
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          displayW: SCREEN_W,
          displayH: IMAGE_AREA_H,
        };
        const initial: CropRect = {
          left: 0,
          top: 0,
          right: SCREEN_W,
          bottom: IMAGE_AREA_H,
        };
        setImageDims({ w: SCREEN_W, h: IMAGE_AREA_H });
        setDisplayInfo(info);
        setCropRect(initial);
        cropRef.current = initial;
        displayRef.current = info;
      },
    );
  }, [visible, imageUri]);

  const clamp = (rect: CropRect, info: DisplayInfo): CropRect => {
    const { offsetX, offsetY, displayW, displayH } = info;
    const minL = offsetX;
    const minT = offsetY;
    const maxR = offsetX + displayW;
    const maxB = offsetY + displayH;

    let { left, top, right, bottom } = rect;
    if (right - left < MIN_CROP_PX) right = left + MIN_CROP_PX;
    if (bottom - top < MIN_CROP_PX) bottom = top + MIN_CROP_PX;

    left = Math.max(minL, Math.min(left, maxR - MIN_CROP_PX));
    top = Math.max(minT, Math.min(top, maxB - MIN_CROP_PX));
    right = Math.min(maxR, Math.max(right, minL + MIN_CROP_PX));
    bottom = Math.min(maxB, Math.max(bottom, minT + MIN_CROP_PX));

    return { left, top, right, bottom };
  };

  const createPanResponder = useCallback(
    (
      type:
        | "topLeft"
        | "topRight"
        | "bottomLeft"
        | "bottomRight"
        | "center",
    ) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, { dx, dy }) => {
          if (!cropRef.current || !displayRef.current) return;
          const prev = cropRef.current;
          const info = displayRef.current;
          let next: CropRect;

          switch (type) {
            case "topLeft":
              next = { ...prev, left: prev.left + dx, top: prev.top + dy };
              break;
            case "topRight":
              next = { ...prev, right: prev.right + dx, top: prev.top + dy };
              break;
            case "bottomLeft":
              next = { ...prev, left: prev.left + dx, bottom: prev.bottom + dy };
              break;
            case "bottomRight":
              next = { ...prev, right: prev.right + dx, bottom: prev.bottom + dy };
              break;
            case "center": {
              const w = prev.right - prev.left;
              const h = prev.bottom - prev.top;
              next = {
                left: prev.left + dx,
                top: prev.top + dy,
                right: prev.left + dx + w,
                bottom: prev.top + dy + h,
              };
              break;
            }
          }

          const clamped = clamp(next, info);
          cropRef.current = clamped;
          setCropRect({ ...clamped });
        },
      }),
    [],
  );

  const panTL = useRef(createPanResponder("topLeft")).current;
  const panTR = useRef(createPanResponder("topRight")).current;
  const panBL = useRef(createPanResponder("bottomLeft")).current;
  const panBR = useRef(createPanResponder("bottomRight")).current;
  const panCenter = useRef(createPanResponder("center")).current;

  const applyCrop = async () => {
    if (!cropRect || !displayInfo || !imageDims) return;
    setApplying(true);
    try {
      const { scale, offsetX, offsetY } = displayInfo;
      const originX = Math.round((cropRect.left - offsetX) / scale);
      const originY = Math.round((cropRect.top - offsetY) / scale);
      const cropW = Math.round((cropRect.right - cropRect.left) / scale);
      const cropH = Math.round((cropRect.bottom - cropRect.top) / scale);

      // Clamp to natural image size
      const safeX = Math.max(0, Math.min(originX, imageDims.w - 1));
      const safeY = Math.max(0, Math.min(originY, imageDims.h - 1));
      const safeW = Math.min(cropW, imageDims.w - safeX);
      const safeH = Math.min(cropH, imageDims.h - safeY);

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX: safeX, originY: safeY, width: safeW, height: safeH } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
      );

      onCrop(result.uri);
    } catch (err) {
      console.error("[CropModal] Crop failed:", err);
    } finally {
      setApplying(false);
    }
  };

  if (!visible) return null;

  const cW = cropRect ? cropRect.right - cropRect.left : 0;
  const cH = cropRect ? cropRect.bottom - cropRect.top : 0;

  return (
    <Modal visible animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <SafeAreaView style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ajustar corte</Text>
          <TouchableOpacity
            style={[styles.headerBtn, styles.applyBtn]}
            onPress={applyCrop}
            disabled={applying || !cropRect}
          >
            {applying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.applyBtnText}>Aplicar</Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>

        {/* Image + crop overlay */}
        <View style={styles.imageArea}>
          {!imageDims ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <>
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
              />

              {cropRect && (
                <>
                  {/* Semi-transparent overlays outside crop rect */}
                  <View
                    pointerEvents="none"
                    style={[styles.overlay, { top: 0, left: 0, right: 0, height: cropRect.top }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[styles.overlay, { top: cropRect.bottom, left: 0, right: 0, bottom: 0 }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[styles.overlay, { top: cropRect.top, left: 0, width: cropRect.left, height: cH }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[styles.overlay, { top: cropRect.top, left: cropRect.right, right: 0, height: cH }]}
                  />

                  {/* Crop border */}
                  <View
                    pointerEvents="none"
                    style={[styles.cropBorder, { left: cropRect.left, top: cropRect.top, width: cW, height: cH }]}
                  />

                  {/* Rule-of-thirds grid */}
                  <View
                    pointerEvents="none"
                    style={[styles.gridV, { left: cropRect.left + cW / 3, top: cropRect.top, height: cH }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[styles.gridV, { left: cropRect.left + (cW * 2) / 3, top: cropRect.top, height: cH }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[styles.gridH, { top: cropRect.top + cH / 3, left: cropRect.left, width: cW }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[styles.gridH, { top: cropRect.top + (cH * 2) / 3, left: cropRect.left, width: cW }]}
                  />

                  {/* Centre drag handle (move entire crop) */}
                  <View
                    {...panCenter.panHandlers}
                    style={[styles.centerHandle, { left: cropRect.left + cW / 2 - 36, top: cropRect.top + cH / 2 - 36 }]}
                  />

                  {/* Corner handles */}
                  <View {...panTL.panHandlers} style={[styles.handle, { left: cropRect.left - HANDLE_SIZE / 2, top: cropRect.top - HANDLE_SIZE / 2, borderTopLeftRadius: 4 }]} />
                  <View {...panTR.panHandlers} style={[styles.handle, { left: cropRect.right - HANDLE_SIZE / 2, top: cropRect.top - HANDLE_SIZE / 2, borderTopRightRadius: 4 }]} />
                  <View {...panBL.panHandlers} style={[styles.handle, { left: cropRect.left - HANDLE_SIZE / 2, top: cropRect.bottom - HANDLE_SIZE / 2, borderBottomLeftRadius: 4 }]} />
                  <View {...panBR.panHandlers} style={[styles.handle, { left: cropRect.right - HANDLE_SIZE / 2, top: cropRect.bottom - HANDLE_SIZE / 2, borderBottomRightRadius: 4 }]} />
                </>
              )}
            </>
          )}
        </View>

        {/* Bottom hint */}
        <View style={styles.hintBar}>
          <Ionicons name="crop-outline" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.hintText}>
            Arraste os cantos para ajustar • Arraste o centro para mover
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1A1A1A",
  },
  headerBtn: {
    padding: 8,
    minWidth: 72,
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  applyBtn: {
    backgroundColor: "#8B3FD9",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    minWidth: 72,
  },
  applyBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  imageArea: {
    flex: 1,
    backgroundColor: "#111",
    overflow: "hidden",
  },
  image: {
    width: SCREEN_W,
    height: IMAGE_AREA_H,
    position: "absolute",
  },
  overlay: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  cropBorder: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  gridV: {
    position: "absolute",
    width: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  gridH: {
    position: "absolute",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  centerHandle: {
    position: "absolute",
    width: 72,
    height: 72,
  },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    backgroundColor: "#fff",
  },
  hintBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: "#1A1A1A",
  },
  hintText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
  },
});
