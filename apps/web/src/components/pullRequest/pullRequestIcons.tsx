import {
  GitMergeIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  LayersIcon,
  Link2Icon,
  Unlink2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import type { PullRequestState } from "@t3tools/contracts";
import { msg } from "gt-react";

export const PullRequestGlyph = {
  pullRequest: GitPullRequestArrowIcon,
  reopen: GitPullRequestArrowIcon,
  draft: GitPullRequestDraftIcon,
  closed: GitPullRequestClosedIcon,
  merged: GitMergeIcon,
  conflicting: TriangleAlertIcon,
  stack: LayersIcon,
  link: Link2Icon,
  unlink: Unlink2Icon,
} as const;

export type PullRequestGlyphIcon = (typeof PullRequestGlyph)[keyof typeof PullRequestGlyph];

export interface PullRequestStatePresentation {
  readonly label: string;
  readonly toneClassName: string;
  readonly Icon: PullRequestGlyphIcon;
}

export const PULL_REQUEST_STATE_PRESENTATION = {
  open: {
    label: msg("Open", { $context: "pull request state" }),
    // BlueCode: emerald-700 in light; 600 read at 3.5:1.
    toneClassName: "text-emerald-700 dark:text-emerald-300/90",
    Icon: PullRequestGlyph.pullRequest,
  },
  draft: {
    label: msg("Draft", { $context: "pull request state" }),
    toneClassName: "text-zinc-500 dark:text-zinc-400/80",
    Icon: PullRequestGlyph.draft,
  },
  closed: {
    label: msg("Closed", { $context: "pull request state" }),
    toneClassName: "text-red-600 dark:text-red-300/90",
    Icon: PullRequestGlyph.closed,
  },
  merged: {
    label: msg("Merged", { $context: "pull request state" }),
    toneClassName: "text-violet-600 dark:text-violet-300/90",
    Icon: PullRequestGlyph.merged,
  },
} as const satisfies Record<PullRequestState | "draft", PullRequestStatePresentation>;
