import { useAvatarLoadingStore } from "@/stores/useAvatarLoadingStore";
import { useEffect } from "react";
import { toast } from "react-toastify";

const AvatarLoadingToast = () => {
    const isLoading = useAvatarLoadingStore((state) => state.isLoading);
    const loadingPercentage = useAvatarLoadingStore(
        (state) => state.loadingPercentage
    );

    useEffect(() => {
        if (isLoading) {
            toast.loading(`Loading avatar ${loadingPercentage}%`, {
                toastId: "avatar-loading-toast",
                position: "top-center",
                autoClose: false,
                closeOnClick: false,
                draggable: false,
                pauseOnHover: false,
                progress: loadingPercentage / 100,
            });
        } else {
            toast.dismiss("avatar-loading-toast");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading]);

    useEffect(() => {
        if (isLoading) {
            toast.update("avatar-loading-toast", {
                render: `Loading avatar ${loadingPercentage}%`,
                progress: loadingPercentage / 100,
            });
        } else {
            toast.dismiss("avatar-loading-toast");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingPercentage]);

    // eslint-disable-next-line unicorn/no-null
    return null;
};

export default AvatarLoadingToast;