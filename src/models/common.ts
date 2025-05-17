import type { StudioObjectSubType, StudioObjectType } from "@/models/studio";


export type Asset = {
  id: string;
  isPublic: boolean;
  thumbnail: string | null;
  path: string;
  createdAt: string;
  title: string;
  authorId: string | null;
  authorUsername: string | null;
  authorNickname: string | null;
  type: StudioObjectType;
  subType?: StudioObjectSubType;
};
