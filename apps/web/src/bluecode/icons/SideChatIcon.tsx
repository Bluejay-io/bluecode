import type { IconProps, IconWeight } from "@phosphor-icons/react";
import SSRBase from "@phosphor-icons/react/dist/lib/SSRBase";
import { ChatTeardrop } from "@phosphor-icons/react/dist/ssr/ChatTeardrop";
import { forwardRef, type ReactElement } from "react";

import { phosphor } from "./phosphorAdapter";

/** BlueCode: the main chat tab draws Phosphor's chat-teardrop. */
export const ChatIcon = phosphor(ChatTeardrop);

// Phosphor has no chat-teardrop-plus; this draws its outline with a plus in the bowl, at each
// weight's line width so it sits beside the stock icons.
const CHAT_TEARDROP_PLUS = new Map<IconWeight, ReactElement>([
  [
    "thin",
    <>
      <path d="M132,28a96.11,96.11,0,0,0-96,96v84a12,12,0,0,0,12,12h84a96,96,0,0,0,0-192Zm0,184H48a4,4,0,0,1-4-4V124a88,88,0,1,1,88,88Z" />
      <path d="M160,120a4,4,0,0,1,0,8H136v24a4,4,0,0,1-8,0V128H104a4,4,0,0,1,0-8H128V96a4,4,0,0,1,8,0V120Z" />
    </>,
  ],
  [
    "light",
    <>
      <path d="M132,26a98.11,98.11,0,0,0-98,98v84a14,14,0,0,0,14,14h84a98,98,0,0,0,0-196Zm0,184H48a2,2,0,0,1-2-2V124a86,86,0,1,1,86,86Z" />
      <path d="M158,118a6,6,0,0,1,0,12H138v20a6,6,0,0,1-12,0V130H106a6,6,0,0,1,0-12H126V98a6,6,0,0,1,12,0V118Z" />
    </>,
  ],
  [
    "regular",
    <>
      <path d="M132,24A100.11,100.11,0,0,0,32,124v84a16,16,0,0,0,16,16h84a100,100,0,0,0,0-200Zm0,184H48V124a84,84,0,1,1,84,84Z" />
      <path d="M156,116a8,8,0,0,1,0,16H140v16a8,8,0,0,1-16,0V132H108a8,8,0,0,1,0-16H124V100a8,8,0,0,1,16,0V116Z" />
    </>,
  ],
  [
    "bold",
    <>
      <path d="M132,20A104.11,104.11,0,0,0,28,124v84a20,20,0,0,0,20,20h84a104,104,0,0,0,0-208Zm0,184H52V124a80,80,0,1,1,80,80Z" />
      <path d="M152,112a12,12,0,0,1,0,24H144v8a12,12,0,0,1-24,0V136H112a12,12,0,0,1,0-24H120V104a12,12,0,0,1,24,0V112Z" />
    </>,
  ],
  [
    "fill",
    <path
      key="fill"
      fillRule="evenodd"
      d="M232,124A100.11,100.11,0,0,1,132,224H48a16,16,0,0,1-16-16V124a100,100,0,0,1,200,0ZM156,116a8,8,0,0,1,0,16H140v16a8,8,0,0,1-16,0V132H108a8,8,0,0,1,0-16H124V100a8,8,0,0,1,16,0V116Z"
    />,
  ],
  [
    "duotone",
    <>
      <path
        d="M224,124h0a92,92,0,0,1-92,92H48a8,8,0,0,1-8-8V124a92,92,0,0,1,92-92h0A92,92,0,0,1,224,124Z"
        opacity="0.2"
      />
      <path d="M132,24A100.11,100.11,0,0,0,32,124v84a16,16,0,0,0,16,16h84a100,100,0,0,0,0-200Zm0,184H48V124a84,84,0,1,1,84,84Z" />
      <path d="M156,116a8,8,0,0,1,0,16H140v16a8,8,0,0,1-16,0V132H108a8,8,0,0,1,0-16H124V100a8,8,0,0,1,16,0V116Z" />
    </>,
  ],
]);

const ChatTeardropPlus = forwardRef<SVGSVGElement, IconProps>(
  function ChatTeardropPlus(props, ref) {
    return <SSRBase ref={ref} {...props} weights={CHAT_TEARDROP_PLUS} />;
  },
);

/** BlueCode: side chats draw the chat-teardrop with a plus, so they read as an extra chat. */
export const SideChatIcon = phosphor(ChatTeardropPlus);
