import { MessageCircle01 } from "@untitledui/icons/MessageCircle01";
import { MessagePlusCircle } from "@untitledui/icons/MessagePlusCircle";

import { stroke } from "./untitledAdapter";

/** BlueCode: the main chat tab draws a speech bubble. */
export const ChatIcon = stroke(MessageCircle01);

/** BlueCode: side chats draw the same bubble with a plus, so they read as an extra chat. */
export const SideChatIcon = stroke(MessagePlusCircle);
