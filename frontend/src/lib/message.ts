import { toast } from "@/components/ui/sonner";

/** Toast-based message helper */
export const message = {
  success(content: string) {
    toast.success(content);
  },
  error(content: string) {
    toast.error(content);
  },
  warning(content: string) {
    toast.warning(content);
  },
  info(content: string) {
    toast.info(content);
  },
  loading(content: string) {
    return toast.loading(content);
  },
};
