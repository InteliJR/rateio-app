import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import billService, { UploadBillResponse } from "../../../services/bill.service";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<UploadBillResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBill();
  }, [id]);

  const loadBill = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billService.getBill(id);
      setBill(data);
    } catch (err: any) {
      console.error("Erro ao carregar conta:", err);
      setError(err.message || "Erro ao carregar dados da conta");
      Alert.alert(
        "Erro",
        "Não foi possível carregar a conta. Tente novamente.",
        [
          { text: "Tentar Novamente", onPress: loadBill },
          { text: "Voltar", onPress: () => router.back(), style: "cancel" },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    // TODO: Navegar para tela de divisão ou próxima etapa
    Alert.alert(
      "Confirmar",
      "Dados da conta estão corretos?",
      [
        { text: "Editar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: () => {
            // Navegar para tela de divisão ou bills
            router.push("/(tabs)/bills");
          },
        },
      ]
    );
  };

  const handleEdit = () => {
    // TODO: Navegar para tela de edição
    Alert.alert("Em desenvolvimento", "Funcionalidade de edição em breve");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING_OCR":
        return "#2196F3";
      case "OCR_FAILED":
        return "#FF9800";
      case "REVIEWING":
        return "#FFA500";
      case "DIVIDING":
        return "#9C27B0";
      case "COMPLETED":
        return "#4CAF50";
      default:
        return "#9E9E9E";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "PENDING_OCR":
        return "Processando OCR";
      case "OCR_FAILED":
        return "OCR Falhou";
      case "REVIEWING":
        return "Em Revisão";
      case "DIVIDING":
        return "Dividindo";
      case "COMPLETED":
        return "Concluído";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Carregando dados da conta...</Text>
      </View>
    );
  }

  if (error || !bill) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
        <Text style={styles.errorText}>{error || "Conta não encontrada"}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadBill}>
          <Text style={styles.retryButtonText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header com status */}
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Ionicons name="document-text-outline" size={32} color="#2196F3" />
            <Text style={styles.title}>Revisão da Conta</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(bill.status) },
            ]}
          >
            <Text style={styles.statusText}>{getStatusText(bill.status)}</Text>
          </View>
        </View>

        {/* Informações básicas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações da Conta</Text>
          
          {bill.establishmentName && (
            <View style={styles.infoRow}>
              <Ionicons name="pricetag-outline" size={20} color="#666" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Estabelecimento</Text>
                <Text style={styles.infoValue}>{bill.establishmentName}</Text>
              </View>
            </View>
          )}

          {bill.totalAmount !== undefined && bill.totalAmount !== null && (
            <View style={styles.infoRow}>
              <Ionicons name="cash-outline" size={20} color="#666" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Valor Total</Text>
                <Text style={styles.infoValue}>
                  R$ {bill.totalAmount?.toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Data de criação</Text>
              <Text style={styles.infoValue}>
                {new Date(bill.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
        </View>

        {/* Imagem da conta */}
        {bill.imageUrl && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Imagem Original</Text>
            <TouchableOpacity
              style={styles.imageButton}
              onPress={() => {
                // TODO: Abrir modal com imagem em tamanho maior
                Alert.alert("Ver imagem", bill.imageUrl);
              }}
            >
              <Ionicons name="image-outline" size={24} color="#2196F3" />
              <Text style={styles.imageButtonText}>Ver imagem da conta</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </View>
        )}

        {/* Dados do OCR */}
        {bill.ocrRawText && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Texto Extraído (OCR)</Text>
            <View style={styles.ocrDataContainer}>
              <Text style={styles.ocrDataText}>
                {bill.ocrRawText}
              </Text>
            </View>
          </View>
        )}

        {/* Mensagens de aviso */}
        {bill.status === "OCR_FAILED" && (
          <View style={styles.warningBox}>
            <Ionicons name="warning-outline" size={24} color="#FF9800" />
            <Text style={styles.warningText}>
              O OCR não conseguiu extrair todos os dados. Você pode editar
              manualmente ou tirar uma nova foto.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Botões de ação */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleEdit}
          disabled={bill.status === "PENDING_OCR"}
        >
          <Ionicons name="pencil-outline" size={20} color="#2196F3" />
          <Text style={styles.secondaryButtonText}>Editar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            bill.status === "PENDING_OCR" && styles.buttonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={bill.status === "PENDING_OCR"}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
          <Text style={styles.primaryButtonText}>Confirmar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: "#FFF",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#FFF",
    padding: 20,
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  imageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  imageButtonText: {
    flex: 1,
    fontSize: 16,
    color: "#2196F3",
    fontWeight: "500",
  },
  ocrDataContainer: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  ocrDataText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#333",
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FFF3E0",
    padding: 16,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#FF9800",
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: "#E65100",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FFEBEE",
    padding: 16,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#F44336",
  },
  errorBoxText: {
    flex: 1,
    fontSize: 14,
    color: "#C62828",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#2196F3",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2196F3",
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "#2196F3",
    borderRadius: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  buttonDisabled: {
    backgroundColor: "#BDBDBD",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: "#F44336",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#2196F3",
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
});
