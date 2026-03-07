import React, { useState, useRef, useEffect } from "react";
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
  LayoutChangeEvent,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";

// Touch target size for corner handles
const HANDLE_HIT = 48;
// Visual L-arm length and thickness for corner markers
const L_ARM = 22;
const L_THICK = 3;
const MIN_CROP_PX = 80;

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

type HandleType = "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "move";

export function CropModal({
  visible,
  imageUri,
  onCrop,
  onCancel,
}: CropModalProps) {
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const [displayInfo, setDisplayInfo] = useState<DisplayInfo | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [applying, setApplying] = useState(false);
  // Actual measured size of the image container (set via onLayout)
  const [areaSize, setAreaSize] = useState<{ w: number; h: number } | null>(null);

  // Refs to avoid stale closures inside PanResponder callbacks
  const cropRef = useRef<CropRect | null>(null);
  const displayRef = useRef<DisplayInfo | null>(null);
  const areaSizeRef = useRef<{ w: number; h: number } | null>(null);

  const buildDisplayInfo = (w: number, h: number, containerW: number, containerH: number): DisplayInfo => {
    const scale = Math.min(containerW / w, containerH / h);
    const displayW = w * scale;
    const displayH = h * scale;
    const offsetX = (containerW - displayW) / 2;
    const offsetY = (containerH - displayH) / 2;
    return { scale, offsetX, offsetY, displayW, displayH };
  };

  // Re-compute display info when measured area size arrives
  useEffect(() => {
    if (!areaSize || !imageDims) return;
    const info = buildDisplayInfo(imageDims.w, imageDims.h, areaSize.w, areaSize.h);
    console.log('[CropModal] displayInfo computed', { imageDims, areaSize, info });
    const initial: CropRect = {
      left: info.offsetX,
      top: info.offsetY,
      right: info.offsetX + info.displayW,
      bottom: info.offsetY + info.displayH,
    };
    setDisplayInfo(info);
    setCropRect(initial);
    cropRef.current = initial;
    displayRef.current = info;
  }, [areaSize, imageDims]);

  useEffect(() => {
    if (!visible || !imageUri) return;
    setImageDims(null);
    setCropRect(null);
    setApplying(false);

    Image.getSize(
      imageUri,
      (w, h) => setImageDims({ w, h }),
      () => setImageDims({
        w: areaSizeRef.current?.w ?? 400,
        h: areaSizeRef.current?.h ?? 600,
      }),
    );
  }, [visible, imageUri]);

  const handleAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    areaSizeRef.current = { w: width, h: height };
    setAreaSize({ w: width, h: height });
  };

  // Clamp a proposed rect so it stays within the displayed image bounds
  // and doesn't shrink below MIN_CROP_PX. For corner drags, only the moved
  // edges are clamped so the opposite edges remain stable.
  const clampRect = (rect: CropRect, info: DisplayInfo): CropRect => {
    const { offsetX, offsetY, displayW, displayH } = info;
    const minL = offsetX;
    const minT = offsetY;
    const maxR = offsetX + displayW;
    const maxB = offsetY + displayH;

    let { left, top, right, bottom } = rect;

    // Enforce minimum size before boundary clamping
    if (right - left < MIN_CROP_PX) {
      // Decide which edge to push: prefer expanding right, fallback to left
      if (right < minL + MIN_CROP_PX) right = left + MIN_CROP_PX;
      else left = right - MIN_CROP_PX;
    }
    if (bottom - top < MIN_CROP_PX) {
      if (bottom < minT + MIN_CROP_PX) bottom = top + MIN_CROP_PX;
      else top = bottom - MIN_CROP_PX;
    }

    // Clamp all edges to the image bounds
    left = Math.max(minL, Math.min(left, maxR - MIN_CROP_PX));
    top = Math.max(minT, Math.min(top, maxB - MIN_CROP_PX));
    right = Math.min(maxR, Math.max(right, minL + MIN_CROP_PX));
    bottom = Math.min(maxB, Math.max(bottom, minT + MIN_CROP_PX));

    // For "move" gesture: keep width/height intact by clamping as a unit
    const w = right - left;
    const h = bottom - top;
    if (left < minL) { left = minL; right = left + w; }
    if (top < minT) { top = minT; bottom = top + h; }
    if (right > maxR) { right = maxR; left = right - w; }
    if (bottom > maxB) { bottom = maxB; top = bottom - h; }

    return { left, top, right, bottom };
  };

  // ─── PanResponder factory ────────────────────────────────────────────────
  // The KEY fix: capture the crop rect on gesture start (onPanResponderGrant),
  // then derive every frame as startRect + cumulativeDelta (dx/dy).
  // Previously the code used currentRef + dx/dy which accumulated deltas
  // on top of already-moved values, causing exponential drift / snapping.
  const makePanResponder = (type: HandleType) => {
    // Each responder has its own startRect snapshot
    const startRect: CropRect = { left: 0, top: 0, right: 0, bottom: 0 };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Snapshot the rect at gesture start — all move events compute from this
        if (cropRef.current) Object.assign(startRect, cropRef.current);
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (!displayRef.current) return;
        const info = displayRef.current;
        let next: CropRect;

        switch (type) {
          case "topLeft":
            next = { ...startRect, left: startRect.left + dx, top: startRect.top + dy };
            break;
          case "topRight":
            next = { ...startRect, right: startRect.right + dx, top: startRect.top + dy };
            break;
          case "bottomLeft":
            next = { ...startRect, left: startRect.left + dx, bottom: startRect.bottom + dy };
            break;
          case "bottomRight":
            next = { ...startRect, right: startRect.right + dx, bottom: startRect.bottom + dy };
            break;
          case "move": {
            const w = startRect.right - startRect.left;
            const h = startRect.bottom - startRect.top;
            next = {
              left: startRect.left + dx,
              top: startRect.top + dy,
              right: startRect.left + dx + w,
              bottom: startRect.top + dy + h,
            };
            break;
          }
          default:
            return;
        }

        const clamped = clampRect(next, info);
        cropRef.current = clamped;
        setCropRect({ ...clamped });
      },
      onPanResponderRelease: () => {
        // Sync startRect for next gesture (not strictly needed since grant does it,
        // but keeps things tidy)
        if (cropRef.current) Object.assign(startRect, cropRef.current);
      },
    });
  };

  // Create pan responders once (they capture startRect in their own closure)
  const panTL = useRef(makePanResponder("topLeft")).current;
  const panTR = useRef(makePanResponder("topRight")).current;
  const panBL = useRef(makePanResponder("bottomLeft")).current;
  const panBR = useRef(makePanResponder("bottomRight")).current;
  const panMove = useRef(makePanResponder("move")).current;

  // ─── Apply crop ──────────────────────────────────────────────────────────
  const applyCrop = async () => {
    if (!cropRect || !displayInfo) return;
    setApplying(true);
    try {
      const { offsetX, offsetY, displayW, displayH } = displayInfo;
      if (displayW <= 0 || displayH <= 0) return;

      // Strategy: resize the original image to 3× the display dimensions first,
      // then crop using display-space coordinates × 3.
      //
      // Why: the previous approach (fracLeft * imageDims.w) relied on Image.getSize
      // returning the exact same coordinate space that ImageManipulator uses.
      // That assumption can break due to EXIF orientation differences, platform
      // quirks, or pixelRatio inconsistencies.
      //
      // By resizing first with BOTH width & height specified, ImageManipulator
      // normalises the image to a known pixel space (display orientation, exact
      // dimensions). The subsequent crop then works purely in that known space.
      const SCALE = 3; // 3× display = good quality without huge files
      const targetW = Math.round(displayW * SCALE);
      const targetH = Math.round(displayH * SCALE);

      // Crop origin/size in the scaled coordinate space
      const cropX = Math.max(0, Math.round((cropRect.left  - offsetX) * SCALE));
      const cropY = Math.max(0, Math.round((cropRect.top   - offsetY) * SCALE));
      const cropW = Math.min(Math.round((cropRect.right  - cropRect.left) * SCALE), targetW - cropX);
      const cropH = Math.min(Math.round((cropRect.bottom - cropRect.top)  * SCALE), targetH - cropY);

      if (cropW <= 0 || cropH <= 0) return;

      console.log('[CropModal] applyCrop', { offsetX, offsetY, displayW, displayH,
        cropRect, targetW, targetH, cropX, cropY, cropW, cropH });

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Step 1 – normalise orientation & establish known pixel space
          { resize: { width: targetW, height: targetH } },
          // Step 2 – crop inside that known space
          { crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } },
        ],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
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
        {/* ── Header ── */}
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

        {/* ── Image area ── */}
        <View style={styles.imageArea} onLayout={handleAreaLayout}>
          {!imageDims || !cropRect || !displayInfo ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <>
              {/* Image positioned EXPLICITLY at the computed offset so crop coords match exactly */}
              <Image
                source={{ uri: imageUri }}
                style={{
                  position: "absolute",
                  left: displayInfo.offsetX,
                  top: displayInfo.offsetY,
                  width: displayInfo.displayW,
                  height: displayInfo.displayH,
                }}
                resizeMode="stretch"
              />

              {/* ── Dark overlays outside crop ── */}
              <View pointerEvents="none" style={[styles.overlay, { top: 0, left: 0, right: 0, height: cropRect.top }]} />
              <View pointerEvents="none" style={[styles.overlay, { top: cropRect.bottom, left: 0, right: 0, bottom: 0 }]} />
              <View pointerEvents="none" style={[styles.overlay, { top: cropRect.top, left: 0, width: cropRect.left, height: cH }]} />
              <View pointerEvents="none" style={[styles.overlay, { top: cropRect.top, left: cropRect.right, right: 0, height: cH }]} />

              {/* ── Crop border ── */}
              <View pointerEvents="none" style={[styles.cropBorder, { left: cropRect.left, top: cropRect.top, width: cW, height: cH }]} />

              {/* ── Rule-of-thirds grid ── */}
              <View pointerEvents="none" style={[styles.gridV, { left: cropRect.left + cW / 3, top: cropRect.top, height: cH }]} />
              <View pointerEvents="none" style={[styles.gridV, { left: cropRect.left + (cW * 2) / 3, top: cropRect.top, height: cH }]} />
              <View pointerEvents="none" style={[styles.gridH, { top: cropRect.top + cH / 3, left: cropRect.left, width: cW }]} />
              <View pointerEvents="none" style={[styles.gridH, { top: cropRect.top + (cH * 2) / 3, left: cropRect.left, width: cW }]} />

              {/* ── Move handle: fills interior (behind corners) ── */}
              <View
                {...panMove.panHandlers}
                style={[styles.moveArea, {
                  left: cropRect.left + HANDLE_HIT / 2,
                  top: cropRect.top + HANDLE_HIT / 2,
                  width: cW - HANDLE_HIT,
                  height: cH - HANDLE_HIT,
                }]}
              />

              {/* ── Corner handles (touch targets + L-shaped visuals) ── */}
              {/* Top-left */}
              <View {...panTL.panHandlers} style={[styles.cornerHit, { left: cropRect.left - HANDLE_HIT / 2, top: cropRect.top - HANDLE_HIT / 2 }]}>
                <View style={styles.cornerTL} />
              </View>
              {/* Top-right */}
              <View {...panTR.panHandlers} style={[styles.cornerHit, { left: cropRect.right - HANDLE_HIT / 2, top: cropRect.top - HANDLE_HIT / 2 }]}>
                <View style={styles.cornerTR} />
              </View>
              {/* Bottom-left */}
              <View {...panBL.panHandlers} style={[styles.cornerHit, { left: cropRect.left - HANDLE_HIT / 2, top: cropRect.bottom - HANDLE_HIT / 2 }]}>
                <View style={styles.cornerBL} />
              </View>
              {/* Bottom-right */}
              <View {...panBR.panHandlers} style={[styles.cornerHit, { left: cropRect.right - HANDLE_HIT / 2, top: cropRect.bottom - HANDLE_HIT / 2 }]}>
                <View style={styles.cornerBR} />
              </View>
            </>
          )}
        </View>

        {/* ── Bottom hint ── */}
        <View style={styles.hintBar}>
          <Ionicons name="crop-outline" size={16} color="rgba(255,255,255,0.6)" />
          <Text style={styles.hintText}>
            Arraste os cantos para redimensionar • Interior para mover
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
  overlay: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  cropBorder: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  gridV: {
    position: "absolute",
    width: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  gridH: {
    position: "absolute",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  // Invisible hit area that fills the crop interior for move gesture
  moveArea: {
    position: "absolute",
  },
  // 48×48 invisible touch target centred on each corner
  cornerHit: {
    position: "absolute",
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    justifyContent: "center",
    alignItems: "center",
  },
  // L-shaped corner markers — each is a pair of absolute rectangles
  // We use a container View and two child Views for the two arms
  cornerTL: {
    width: L_ARM,
    height: L_ARM,
    borderTopWidth: L_THICK,
    borderLeftWidth: L_THICK,
    borderColor: "#fff",
    position: "absolute",
    top: HANDLE_HIT / 2 - L_ARM / 2,
    left: HANDLE_HIT / 2 - L_ARM / 2,
  },
  cornerTR: {
    width: L_ARM,
    height: L_ARM,
    borderTopWidth: L_THICK,
    borderRightWidth: L_THICK,
    borderColor: "#fff",
    position: "absolute",
    top: HANDLE_HIT / 2 - L_ARM / 2,
    left: HANDLE_HIT / 2 - L_ARM / 2,
  },
  cornerBL: {
    width: L_ARM,
    height: L_ARM,
    borderBottomWidth: L_THICK,
    borderLeftWidth: L_THICK,
    borderColor: "#fff",
    position: "absolute",
    top: HANDLE_HIT / 2 - L_ARM / 2,
    left: HANDLE_HIT / 2 - L_ARM / 2,
  },
  cornerBR: {
    width: L_ARM,
    height: L_ARM,
    borderBottomWidth: L_THICK,
    borderRightWidth: L_THICK,
    borderColor: "#fff",
    position: "absolute",
    top: HANDLE_HIT / 2 - L_ARM / 2,
    left: HANDLE_HIT / 2 - L_ARM / 2,
  },
  hintBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: "#1A1A1A",
  },
  hintText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    textAlign: "center",
  },
});
