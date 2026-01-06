import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Mic } from 'lucide-react';
import { Message } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

interface ChatMessageProps {
    message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

    // Parse for <thinking> tags
    // Parse for <thinking> tags
    const thinkingMatches = message.role === 'model' && message.text
        ? [...message.text.matchAll(/<thinking>([\s\S]*?)<\/thinking>/g)]
        : [];

    const thinkingContent = thinkingMatches.length > 0
        ? thinkingMatches.map(m => m[1].replace(/<\/?thinking>/g, '').trim()).join('\n\n')
        : null;

    const mainContent = message.role === 'model' && message.text
        ? message.text.replace(/<thinking>([\s\S]*?)<\/thinking>/g, '').trim()
        : message.text;

    // Render User Message
    if (message.role === 'user') {
        return (
            <div className="flex gap-4 mb-8 justify-end">
                <div className="flex flex-col max-w-[85%] md:max-w-[85%] items-end">
                    {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {message.attachments.map((att, i) => (
                                <div key={i} className="relative group">
                                    {att.mimeType.startsWith('image/') ? (
                                        <img
                                            src={`data:${att.mimeType};base64,${att.data}`}
                                            alt="attachment"
                                            className="h-32 w-auto rounded-lg border border-gray-200 dark:border-[#444] object-cover"
                                        />
                                    ) : (
                                        <div className="h-16 w-32 bg-gray-100 dark:bg-[#333] rounded-lg flex items-center justify-center text-xs text-gray-500">
                                            Audio/File
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="px-5 py-3.5 rounded-2xl text-[15px] leading-7 bg-[#f0f4f9] dark:bg-[#333537] text-gray-800 dark:text-gray-100 rounded-tr-sm">
                        <div className="whitespace-pre-wrap">{message.text}</div>
                    </div>
                </div>
            </div>
        );
    }

    // Render Model Message
    return (
        <div className="flex gap-4 mb-8">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-red-500 flex items-center justify-center shrink-0 mt-1">
                <Sparkles className="w-5 h-5 text-white" />
            </div>

            <div className="flex flex-col max-w-[85%] md:max-w-[85%] items-start w-full">
                {thinkingContent && (
                    <div className="mb-2 w-full">
                        <button
                            onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333] px-2 py-1 rounded-md transition-colors"
                        >
                            <span>Show thinking</span>
                            {isThinkingExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </button>

                        {isThinkingExpanded && (
                            <div className="mt-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700 ml-2">
                                <div className="text-gray-500 dark:text-gray-400 italic text-sm">
                                    <MarkdownRenderer content={thinkingContent} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {mainContent ? (
                    <div className="text-gray-800 dark:text-gray-100 w-full px-5 py-3.5">
                        <MarkdownRenderer content={mainContent} />
                    </div>
                ) : (
                    // Loading State only if no thinking content and no main content? 
                    // Actually, if we have thinking content but no main content yet, we should show thinking.
                    // If we have neither, we show loading dots.
                    !thinkingContent && (
                        <div className="px-5 py-3.5">
                            <div className="flex gap-1 items-center h-6">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
