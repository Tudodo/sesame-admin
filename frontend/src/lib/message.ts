import { toast } from "@/components/ui/sonner";

/** Drop-in replacement for antd's message API */
export const message = {
  success(content: string) {
    toast.success(content);
  },
  error(content: string) {
    toast.error(content, { duration: 8000 });
  },
  warning(content: string) {
    toast.warning(content, { duration: 6000 });
  },
  info(content: string) {
    toast.info(content);
  },
  loading(content: string) {
    return toast.loading(content);
  },
};
