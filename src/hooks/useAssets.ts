import { useEffect, useState } from "react";

import type { Asset } from "@/models/common";
import type { StudioObjectType } from "@/models/studio";

import ArchitectureAssetsJSON from "@/jsons/asset_architectures.json";
import DecorationAssetsJSON from "@/jsons/asset_decorations.json";
import EntertainmentAssetsJSON from "@/jsons/asset_entertainments.json";
import FurnitureAssetsJSON from "@/jsons/asset_furnitures.json";
import SkyboxAssetsJSON from "@/jsons/asset_skyboxs.json";

type AssetRecord = Record<string, Asset>;
type AssetJsonWithResults = { results: Asset[] };

const useAssets = () => {
    const [architectures, setArchitectures] = useState<AssetRecord>({});
    const [decorations, setDecorations] = useState<AssetRecord>({});
    const [entertainments, setEntertainments] = useState<AssetRecord>({});
    const [furnitures, setFurnitures] = useState<AssetRecord>({});
    const [skyboxs, setSkyboxs] = useState<AssetRecord>({});
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>();

    useEffect(() => {
        let canceled = false;

        const assetJSONUrl: Record<StudioObjectType, AssetJsonWithResults> = {
            architectures: ArchitectureAssetsJSON as AssetJsonWithResults,
            decorations: DecorationAssetsJSON as AssetJsonWithResults,
            entertainments: EntertainmentAssetsJSON as AssetJsonWithResults,
            furnitures: FurnitureAssetsJSON as AssetJsonWithResults,
            skyboxs: SkyboxAssetsJSON as AssetJsonWithResults,
        };

        async function loadAssets() {
            try {
                setLoading(true);

                const keys = Object.keys(assetJSONUrl) as StudioObjectType[];

                for (const type of keys) {
                    const record: Record<string, Asset> = {};
                    for (const obj of assetJSONUrl[type].results as Asset[]) {
                        if (!(obj.id in record)) record[obj.id] = obj;
                    }
                    if (canceled) return;

                    switch (type) {
                        case "architectures": {
                            setArchitectures(record);
                            break;
                        }
                        case "decorations": {
                            setDecorations(record);
                            break;
                        }
                        case "entertainments": {
                            setEntertainments(record);
                            break;
                        }
                        case "furnitures": {
                            setFurnitures(record);
                            break;
                        }
                        case "skyboxs": {
                            setSkyboxs(record);
                            break;
                        }
                    }
                }
            } catch (error) {
                if (!canceled) setError(error as Error);
            } finally {
                if (!canceled) setLoading(false);
            }
        }

        loadAssets();

        return () => {
            canceled = true;
        };
    }, []);

    return {
        architectures,
        decorations,
        entertainments,
        furnitures,
        skyboxs,
        loading,
        error,
    };
};

export default useAssets;
