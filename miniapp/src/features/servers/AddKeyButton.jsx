import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { AuroraButton } from "../../components/ui/vpnPrimitives";
import { openOutlineKey } from "../../lib/links";

export default function AddKeyButton({ outlineKey, server, disabled, onError }) {
  const handleAddKey = () => {
    try {
      openOutlineKey(outlineKey || server);
    } catch (error) {
      onError?.(error?.message || "Failed to open Outline key");
    }
  };

  return (
    <AuroraButton
      startIcon={<DownloadRoundedIcon />}
      onClick={handleAddKey}
      disabled={disabled}
    >
      Add Key To Outline
    </AuroraButton>
  );
}
