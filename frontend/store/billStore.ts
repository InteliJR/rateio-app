import { create } from 'zustand';
import { UploadBillResponse } from '../services/bill.service';

interface BillState {
  bills: UploadBillResponse[];
  addBill: (bill: UploadBillResponse) => void;
  setBills: (bills: UploadBillResponse[]) => void;
  clearBills: () => void;
}

export const useBillStore = create<BillState>((set) => ({
  bills: [],
  addBill: (bill) => set((state) => ({ bills: [bill, ...state.bills] })),
  setBills: (bills) => set({ bills }),
  clearBills: () => set({ bills: [] }),
}));
