import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody } from "@/components/ui/dialog";
import { OrderForm } from "./OrderForm";
import type { Plan } from "../types/api";

interface Props {
  open: boolean;
  plans: Plan[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function CreateOrderDialog({ open, plans, onClose, onCreated }: Props) {
  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader className="border-b border-border/70 px-4 py-3 pb-2 sm:border-b-0">
        <DialogTitle className="text-base">Create Order</DialogTitle>
        <DialogDescription className="text-xs">
          Manual orders are created after customer payment.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="max-h-[calc(100dvh-74px)] overflow-y-auto px-4 py-3 pb-0 sm:max-h-[72vh]">
        <OrderForm plans={plans} onSuccess={onCreated} onCancel={onClose} />
      </DialogBody>
    </Dialog>
  );
}
