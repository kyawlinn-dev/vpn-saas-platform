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
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle>Create Order</DialogTitle>
        <DialogDescription>
          Fast reseller order entry. Name is required. Contact is optional.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <OrderForm plans={plans} onSuccess={onCreated} onCancel={onClose} />
      </DialogBody>
    </Dialog>
  );
}
