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
      <DialogHeader className="px-4 py-3 pb-2">
        <DialogTitle className="text-base">Create Order</DialogTitle>
        <DialogDescription className="text-xs">
          Fast reseller order entry. Name is required. Contact is optional.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="max-h-none overflow-visible px-4 py-3">
        <OrderForm plans={plans} onSuccess={onCreated} onCancel={onClose} />
      </DialogBody>
    </Dialog>
  );
}
