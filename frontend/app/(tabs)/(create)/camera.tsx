import { logger } from '../../../lib/logger';
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  ScrollView,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import billService from "../../../services/bill.service";
import { CropModal } from "../../../components/modals/CropModal";
import { useTheme } from "../../../contexts/ThemeContext";

const { width, height } = Dimensions.get("window");

export default function CameraScreen() {
  const { colors, getFontSize } = useTheme();
  const router = useRouter();
  const { id, participants } = useLocalSearchParams();
  const cameraRef = useRef<CameraView>(null);

  // Estados
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<
    "idle" | "optimizing" | "uploading" | "processing"
  >("idle");
  const [imageQuality, setImageQuality] = useState<
    "boa" | "media" | "baixa" | null
  >(null);
  const [imageResolution, setImageResolution] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);

  // Solicitar permissões ao montar o componente
  useEffect(() => {
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
    })();
  }, []);

  // Verificar resolução da imagem e classificar qualidade
  const checkImageResolution = (uri: string) => {
    Image.getSize(
      uri,
      (w, h) => {
        setImageResolution({ width: w, height: h });
        if (w >= 1280 && h >= 960) {
          setImageQuality("boa");
        } else if (w >= 640 && h >= 480) {
          setImageQuality("media");
        } else {
          setImageQuality("baixa");
        }
      },
      () => {
        setImageResolution(null);
        setImageQuality("media");
      },
    );
  };

  // Função para capturar foto
  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        setIsLoading(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
          shutterSound: false
        });

        if (photo?.uri) {
          setCapturedImage(photo.uri);
          checkImageResolution(photo.uri);
        }
      } catch (error) {
        logger.error("Erro ao capturar foto:", error);
        Alert.alert("Erro", "Não foi possível capturar a foto");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Função para alternar entre câmera frontal/traseira
  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  // Função para escolher da galeria
  const pickFromGallery = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permissão necessária",
          "Precisamos de acesso à galeria para continuar",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1, // full quality — optimizeImage compresses later
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
        checkImageResolution(result.assets[0].uri);
      }
    } catch (error) {
      logger.error("Erro ao escolher imagem:", error);
      Alert.alert("Erro", "Não foi possível acessar a galeria");
    }
  };

  // Função para refazer (tirar nova foto)
  const retakePicture = () => {
    setCapturedImage(null);
    setUploadStage("idle");
    setUploadProgress(0);
    setImageQuality(null);
    setImageResolution(null);
    setShowCropModal(false);
  };

  // Retorna cor e label do badge de qualidade
  const getQualityBadge = () => {
    switch (imageQuality) {
      case "boa":
        return { color: "#22C55E", label: "Qualidade boa" };
      case "media":
        return { color: "#F59E0B", label: "Qualidade média" };
      case "baixa":
        return { color: "#EF4444", label: "Qualidade baixa" };
      default:
        return null;
    }
  };

  // Função para obter mensagem de progresso
  const getProgressMessage = (): string => {
    switch (uploadStage) {
      case "optimizing":
        return "Otimizando imagem...";
      case "uploading":
        return "Enviando imagem...";
      case "processing":
        return "Processando conta...";
      default:
        return "Escaneando...";
    }
  };

  // Função para otimizar imagem
  const optimizeImage = async (imageUri: string) => {
    try {
      // Na web, pular otimização (FileSystem não funciona)
      if (Platform.OS === "web") {
        logger.debug("Pulando otimização na web");
        return imageUri;
      }

      // Obter informações da imagem original
      const imageInfo = await FileSystem.getInfoAsync(imageUri);

      // Obter dimensões da imagem
      const { width: imgWidth, height: imgHeight } = await new Promise<{
        width: number;
        height: number;
      }>((resolve, reject) => {
        Image.getSize(
          imageUri,
          (width, height) => resolve({ width, height }),
          (error) => reject(error),
        );
      });

      // Calcular novo tamanho mantendo proporção (máx 1920px de largura)
      const MAX_WIDTH = 1920;
      let newWidth = imgWidth;
      let newHeight = imgHeight;

      if (imgWidth > MAX_WIDTH) {
        newWidth = MAX_WIDTH;
        newHeight = Math.round((imgHeight * MAX_WIDTH) / imgWidth);
      }

      // Processar imagem: redimensionar, comprimir e converter para JPEG
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: newWidth, height: newHeight } }],
        {
          compress: 0.8, // 80% de qualidade
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      // Verificar tamanho do arquivo final
      const finalImageInfo = await FileSystem.getInfoAsync(
        manipulatedImage.uri,
      );
      const fileSizeInMB =
        (finalImageInfo.exists && "size" in finalImageInfo
          ? finalImageInfo.size
          : 0) /
        (1024 * 1024);
      const MAX_SIZE_MB = 5;

      if (fileSizeInMB > MAX_SIZE_MB) {
        throw new Error(
          `Imagem muito grande (${fileSizeInMB.toFixed(
            2,
          )}MB). Máximo permitido: ${MAX_SIZE_MB}MB`,
        );
      }

      logger.debug("Imagem otimizada:", {
        originalSize: `${(
          (imageInfo.exists && "size" in imageInfo ? imageInfo.size : 0) /
          (1024 * 1024)
        ).toFixed(2)}MB`,
        finalSize: `${fileSizeInMB.toFixed(2)}MB`,
        originalDimensions: `${imgWidth}x${imgHeight}`,
        finalDimensions: `${newWidth}x${newHeight}`,
      });

      return manipulatedImage.uri;
    } catch (error) {
      logger.error("Erro ao otimizar imagem:", error);
      throw error;
    }
  };

  // Função para confirmar e processar a imagem
  const confirmPicture = async () => {
    if (!capturedImage) return;

    // Avisar sobre resolução baixa, mas permitir continuar
    if (imageQuality === "baixa") {
      await new Promise<void>((resolve, reject) => {
        Alert.alert(
          "Resolução baixa",
          `A imagem tem resolução ${imageResolution ? `${imageResolution.width}×${imageResolution.height}px` : "baixa"}, o que pode prejudicar o reconhecimento de texto. Recomendamos tirar uma nova foto.`,
          [
            {
              text: "Refazer foto",
              style: "cancel",
              onPress: () => reject("retake"),
            },
            { text: "Usar mesmo assim", onPress: () => resolve() },
          ],
        );
      }).catch((reason) => {
        if (reason === "retake") retakePicture();
        throw new Error("__cancelled__");
      });
    }

    try {
      setIsLoading(true);
      setUploadProgress(0);

      // Etapa 1: Otimizar imagem (0-30%)
      setUploadStage("optimizing");
      setUploadProgress(10);
      const optimizedImageUri = await optimizeImage(capturedImage);
      setUploadProgress(30);

      // Etapa 2: Upload da imagem (30-60%)
      setUploadStage("uploading");
      setUploadProgress(40);

      // Simular progresso durante upload
      const uploadInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 60));
      }, 300);

      let uploadedBill;

      // Se já temos um ID (veio da tela anterior), usar endpoint específico
      if (id && typeof id === "string") {
        logger.debug("Upload de imagem para conta existente:", id);
        uploadedBill = await billService.uploadBillImage(id, optimizedImageUri);
      } else {
        // Senão, criar nova conta (comportamento antigo)
        logger.debug("Criando nova conta com imagem");
        uploadedBill = await billService.uploadBill(optimizedImageUri);
      }

      clearInterval(uploadInterval);
      setUploadProgress(60);

      // Etapa 3: Processamento OCR (60-100%)
      // O OCR roda assincronamente no backend; navegamos imediatamente para a
      // tela de edição que fará polling do status.
      setUploadStage("processing");
      setUploadProgress(100);

      // Resetar estados
      setUploadStage("idle");
      setUploadProgress(0);
      setCapturedImage(null);

      // Navegar para tela de itens escaneados (scanned.tsx)
      router.replace({
        pathname: "/(tabs)/(create)/scanned",
        params: { id: uploadedBill.id, editMode: "false" },
      });
    } catch (error: any) {
      logger.error("❌ Erro ao processar conta:", {
        message: error.message,
        statusCode: error.statusCode,
        response: error.response?.status,
        data: error.response?.data,
        code: error.code,
        stack: error.stack,
      });

      // Cancelamento pelo usuário (escolheu refazer foto) — não mostrar alerta
      if (error.message === "__cancelled__") return;

      let errorTitle = "Erro ao processar conta";
      let errorMessage = "Não foi possível processar a conta. Tente novamente.";
      let showRetry = true;

      // Tratamento específico por tipo de erro

      // Erro de timeout (mais de 60s)
      if (
        error.code === "ECONNABORTED" ||
        error.message?.toLowerCase().includes("timeout")
      ) {
        errorTitle = "Tempo esgotado";
        errorMessage =
          "O processamento está demorando muito. Tente novamente com uma imagem mais clara ou verifique sua conexão.";
        showRetry = true;
      }
      // Erro de rede (sem internet)
      else if (
        error.message?.toLowerCase().includes("network") ||
        error.code === "NETWORK_ERROR"
      ) {
        errorTitle = "Sem conexão";
        errorMessage =
          "Verifique sua conexão com a internet e tente novamente.";
        showRetry = true;
      }
      // Erro 413: Arquivo muito grande
      else if (error.response?.status === 413 || error.statusCode === 413) {
        errorTitle = "Imagem muito grande";
        errorMessage =
          "A imagem é muito grande (máx 5MB). Tente tirar outra foto ou reduzir a resolução.";
        showRetry = false; // Não adianta tentar novamente sem mudar a imagem
      }
      // Erro 400: Formato inválido ou validação
      else if (error.response?.status === 400 || error.statusCode === 400) {
        errorTitle = "Formato inválido";
        errorMessage =
          error.response?.data?.message ||
          error.message ||
          "Formato de imagem não suportado ou dados inválidos.";
        showRetry = false;
      }
      // Erro 401/403: Não autorizado
      else if (error.response?.status === 401 || error.statusCode === 401) {
        errorTitle = "Sessão expirada";
        errorMessage = "Sua sessão expirou. Faça login novamente.";
        showRetry = false;
      }
      // Erro 500: Erro no servidor
      else if (error.response?.status === 500 || error.statusCode === 500) {
        errorTitle = "Erro no servidor";
        errorMessage =
          "Nossos servidores estão com problema. Tente novamente em alguns minutos.";
        showRetry = true;
      }
      // Erro 503: Serviço indisponível
      else if (error.response?.status === 503 || error.statusCode === 503) {
        errorTitle = "Serviço indisponível";
        errorMessage =
          "O servidor está temporariamente indisponível. Tente novamente em alguns instantes.";
        showRetry = true;
      }
      // Erro de otimização de imagem (antes do upload)
      else if (
        error.message?.includes("otimizar") ||
        error.message?.includes("compress")
      ) {
        errorTitle = "Erro ao processar imagem";
        errorMessage =
          "Não foi possível otimizar a imagem. Tente tirar outra foto.";
        showRetry = false;
      }
      // OCR falhou (backend retornou mas OCR não funcionou)
      else if (
        error.message?.toLowerCase().includes("ocr") ||
        error.response?.data?.status === "OCR_FAILED"
      ) {
        errorTitle = "OCR falhou";
        errorMessage =
          "Não foi possível reconhecer o texto da conta. Tente tirar uma foto mais clara e bem iluminada.";
        showRetry = true;
      }
      // Erro genérico do backend
      else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      // Erro genérico
      else if (error.message) {
        errorMessage = error.message;
      }

      // Construir array de botões do Alert
      const alertButtons: Array<{
        text: string;
        style?: "cancel" | "default" | "destructive";
        onPress?: () => void;
      }> = [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => {
            // Resetar estados
            setUploadStage("idle");
            setUploadProgress(0);
            setIsLoading(false);
          },
        },
      ];

      // Adicionar botão "Tentar Novamente" se apropriado
      if (showRetry) {
        alertButtons.push({
          text: "Tentar Novamente",
          onPress: () => {
            // Resetar estados e tentar novamente
            setUploadStage("idle");
            setUploadProgress(0);
            setIsLoading(false);
            // Tentar novamente após um pequeno delay
            setTimeout(() => confirmPicture(), 100);
          },
        });
      } else {
        alertButtons.push({
          text: "Tirar Nova Foto",
          onPress: () => {
            // Resetar tudo e voltar para câmera
            setUploadStage("idle");
            setUploadProgress(0);
            setIsLoading(false);
            setCapturedImage(null);
          },
        });
      }

      Alert.alert(errorTitle, errorMessage, alertButtons);

      // Resetar estados em caso de erro (se não for retry)
      if (!showRetry) {
        setUploadStage("idle");
        setUploadProgress(0);
      }
    } finally {
      // Garantir que loading seja desabilitado apenas se não estiver retrying
      // O retry vai iniciar novamente o loading
      if (!isLoading) {
        setIsLoading(false);
      }
    }
  };

  // Verificar permissões
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={[styles.permissionText, { fontSize: getFontSize(18) }]}>
          Precisamos de acesso à câmera
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
        >
          <Text
            style={[
              styles.permissionButtonText,
              { color: colors.accent, fontSize: getFontSize(16) },
            ]}
          >
            Conceder Permissão
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Se uma imagem foi capturada, mostrar preview
  if (capturedImage) {
    const badge = getQualityBadge();
    return (
      <View style={styles.container}>
        {/* Preview full-screen com suporte a zoom/pan via ScrollView */}
        <ScrollView
          style={styles.previewScroll}
          contentContainerStyle={styles.previewScrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          pinchGestureEnabled
          bouncesZoom
        >
          <Image
            source={{ uri: capturedImage }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        </ScrollView>

        {/* Badge de qualidade */}
        {badge && !isLoading && (
          <View
            style={[
              styles.qualityBadge,
              { backgroundColor: badge.color + "DD" },
            ]}
          >
            <Ionicons
              name={
                imageQuality === "boa"
                  ? "checkmark-circle"
                  : imageQuality === "media"
                    ? "information-circle"
                    : "warning"
              }
              size={14}
              color={colors.text}
            />
            <Text style={[styles.qualityBadgeText, { color: colors.text }]}>
              {badge.label}
            </Text>
            {imageResolution && (
              <Text
                style={[
                  styles.qualityResolutionText,
                  { color: colors.textSecondary },
                ]}
              >
                {imageResolution.width}×{imageResolution.height}
              </Text>
            )}
          </View>
        )}

        {/* Overlay de Loading com Progresso */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text
                style={[
                  styles.loadingText,
                  { color: colors.accent, fontSize: getFontSize(18) },
                ]}
              >
                {getProgressMessage()}
              </Text>

              {/* Barra de Progresso */}
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarBackground,
                    { backgroundColor: colors.divider },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${uploadProgress}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.progressText,
                    { color: colors.accent, fontSize: getFontSize(14) },
                  ]}
                >
                  {uploadProgress}%
                </Text>
              </View>

              {/* Dica baseada no estágio */}
              <Text
                style={[
                  styles.progressHint,
                  { color: colors.accent, fontSize: getFontSize(14) },
                ]}
              >
                {uploadStage === "optimizing" && "Preparando sua imagem..."}
                {uploadStage === "uploading" &&
                  "Isso pode levar alguns segundos..."}
                {uploadStage === "processing" &&
                  "Identificando itens da conta..."}
              </Text>
            </View>
          </View>
        )}

        {/* Botões de ação */}
        {!isLoading && (
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[
                styles.retakeButton,
                {
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.backgroundTertiary,
                },
              ]}
              onPress={retakePicture}
            >
              <Ionicons name="camera-outline" size={20} color={colors.text} />
              <Text style={[styles.retakeButtonText, { color: colors.text }]}>
                Refazer
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.cropButton,
                {
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.backgroundTertiary,
                },
              ]}
              onPress={() => setShowCropModal(true)}
            >
              <Ionicons name="crop-outline" size={20} color={colors.text} />
              <Text style={[styles.cropButtonText, { color: colors.text }]}>
                Recortar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                },
              ]}
              onPress={confirmPicture}
            >
              <Ionicons name="checkmark" size={20} color={colors.accent} />
              <Text
                style={[styles.confirmButtonText, { color: colors.accent }]}
              >
                Usar foto
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Modal de corte interativo */}
        <CropModal
          visible={showCropModal}
          imageUri={capturedImage}
          onCrop={(croppedUri) => {
            setShowCropModal(false);
            setCapturedImage(croppedUri);
            checkImageResolution(croppedUri);
          }}
          onCancel={() => setShowCropModal(false)}
        />
      </View>
    );
  }

  // Modo Câmera
  return (
    <View style={styles.container}>
      {/* CameraView */}
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        {/* Overlay de enquadramento */}
        <View style={styles.cameraOverlay}>
          <View style={styles.frameContainer}>
            {/* Bordas amarelas de enquadramento */}
            <View style={[styles.cornerBorder, styles.topLeft]} />
            <View style={[styles.cornerBorder, styles.topRight]} />
            <View style={[styles.cornerBorder, styles.bottomLeft]} />
            <View style={[styles.cornerBorder, styles.bottomRight]} />
          </View>
        </View>

        {/* Controles da Câmera */}
        <View style={styles.controls}>
          {/* Botão Galeria */}
          <TouchableOpacity
            style={[
              styles.iconButton,
              {
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                borderColor: "rgba(255, 255, 255, 0.45)",
              },
            ]}
            onPress={pickFromGallery}
          >
            <Ionicons name="images-outline" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Botão Capturar */}
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <View
                style={[
                  styles.captureButtonInner,
                  { backgroundColor: colors.primary },
                ]}
              />
            )}
          </TouchableOpacity>

          {/* Botão Alternar Câmera */}
          <TouchableOpacity
            style={[
              styles.iconButton,
              {
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                borderColor: "rgba(255, 255, 255, 0.45)",
              },
            ]}
            onPress={toggleCameraFacing}
          >
            <Ionicons
              name="camera-reverse-outline"
              size={28}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  frameContainer: {
    width: width * 0.85,
    height: height * 0.6,
    position: "relative",
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 40,
    backgroundColor: "transparent",
  },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  // Corner borders used in the live camera viewfinder
  cornerBorder: {
    position: "absolute",
    width: 60,
    height: 60,
    borderColor: "#F4C430",
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 5,
    borderColor: "rgba(255, 255, 255, 0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#8B3FD9",
  },
  previewScroll: {
    flex: 1,
    backgroundColor: "#1A1A1A",
  },
  previewScrollContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width,
    height: height - 100, // leave room for action buttons
  },
  qualityBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  qualityBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  qualityResolutionText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 26, 26, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
    paddingHorizontal: 40,
    width: width * 0.8,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginTop: 20,
    fontWeight: "500",
  },
  progressBarContainer: {
    width: "100%",
    marginTop: 24,
    alignItems: "center",
  },
  progressBarBackground: {
    width: "100%",
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#8B3FD9",
    borderRadius: 4,
  },
  progressText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 8,
    fontWeight: "600",
  },
  progressHint: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
    fontStyle: "italic",
  },
  previewActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    backgroundColor: "#1A1A1A",
    gap: 8,
  },
  retakeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  retakeButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  cropButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  cropButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#8B3FD9",
    paddingVertical: 14,
    borderRadius: 50,
    shadowColor: "#8B3FD9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  permissionText: {
    color: "#FFFFFF",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: "#8B3FD9",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 50,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
