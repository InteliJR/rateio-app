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
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import billService from "../../../services/bill.service";

const { width, height } = Dimensions.get("window");

export default function CameraScreen() {
  const router = useRouter();
  const { id, participants } = useLocalSearchParams();
  const cameraRef = useRef<CameraView>(null);

  // Estados
  const [facing, setFacing] = useState<CameraType>("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Solicitar permissões ao montar o componente
  useEffect(() => {
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
    })();
  }, []);

  // Função para capturar foto
  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        setIsLoading(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: false,
        });

        if (photo?.uri) {
          setCapturedImage(photo.uri);
        }
      } catch (error) {
        console.error("Erro ao capturar foto:", error);
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
          "Precisamos de acesso à galeria para continuar"
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Erro ao escolher imagem:", error);
      Alert.alert("Erro", "Não foi possível acessar a galeria");
    }
  };

  // Função para refazer (tirar nova foto)
  const retakePicture = () => {
    setCapturedImage(null);
  };

  // Função para otimizar imagem
  const optimizeImage = async (imageUri: string) => {
    try {
      // Na web, pular otimização (FileSystem não funciona)
      if (Platform.OS === "web") {
        console.log("Pulando otimização na web");
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
          (error) => reject(error)
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
        }
      );

      // Verificar tamanho do arquivo final
      const finalImageInfo = await FileSystem.getInfoAsync(
        manipulatedImage.uri
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
            2
          )}MB). Máximo permitido: ${MAX_SIZE_MB}MB`
        );
      }

      console.log("Imagem otimizada:", {
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
      console.error("Erro ao otimizar imagem:", error);
      throw error;
    }
  };

  // Função para confirmar e processar a imagem
  const confirmPicture = async () => {
    if (!capturedImage) return;

    try {
      setIsLoading(true);

      // Otimizar imagem antes de processar
      const optimizedImageUri = await optimizeImage(capturedImage);

      router.push({
        pathname: "/(tabs)/(create)/scanned",
        params: {
          id,
          participants: participants as string,
        },
      });

      // Fazer upload da imagem para o servidor
      const uploadedBill = await billService.uploadBill(optimizedImageUri);

      // Navegar para tela de revisão com os dados da conta
      Alert.alert("Sucesso", "Conta processada com sucesso!", [
        {
          text: "OK",
          onPress: () => {
            // Voltar para a tela anterior e passar dados via params se necessário
            router.push("/(tabs)/(create)/scanned");
          },
        },
      ]);
    } catch (error: any) {
      console.error("Erro ao processar imagem:", error);
      const errorMessage =
        error.message || "Não foi possível processar a imagem";
      Alert.alert("Erro", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Verificar permissões
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Precisamos de acesso à câmera</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Conceder Permissão</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Se uma imagem foi capturada, mostrar preview
  if (capturedImage) {
    return (
      <View style={styles.container}>
        {/* Preview da Imagem com bordas amarelas */}
        <View style={styles.previewContainer}>
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: capturedImage }}
              style={styles.previewImage}
            />

            {/* Bordas amarelas de enquadramento */}
            <View style={[styles.cornerBorder, styles.topLeft]} />
            <View style={[styles.cornerBorder, styles.topRight]} />
            <View style={[styles.cornerBorder, styles.bottomLeft]} />
            <View style={[styles.cornerBorder, styles.bottomRight]} />
          </View>

          {/* Overlay de Loading */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingContent}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.loadingText}>Escaneando....</Text>
              </View>
            </View>
          )}
        </View>

        {/* Botão de Confirmar no estilo roxo */}
        <View style={styles.previewActions}>
          <TouchableOpacity
            style={styles.retakeIconButton}
            onPress={retakePicture}
            disabled={isLoading}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={confirmPicture}
            disabled={isLoading}
          >
            <Text style={styles.confirmButtonText}>Confirmar</Text>
          </TouchableOpacity>
        </View>
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
          <TouchableOpacity style={styles.iconButton} onPress={pickFromGallery}>
            <Ionicons name="images-outline" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Botão Capturar */}
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="large" color="#8B3FD9" />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          {/* Botão Alternar Câmera */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={toggleCameraFacing}
          >
            <Ionicons name="camera-reverse-outline" size={28} color="#FFFFFF" />
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
  previewContainer: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrapper: {
    width: width * 0.9,
    height: height * 0.7,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 26, 26, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginTop: 20,
    fontWeight: "500",
  },
  previewActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 30,
    backgroundColor: "#1A1A1A",
  },
  retakeIconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  confirmButton: {
    flex: 1,
    backgroundColor: "#8B3FD9",
    paddingVertical: 18,
    borderRadius: 50,
    marginLeft: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#8B3FD9",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
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
