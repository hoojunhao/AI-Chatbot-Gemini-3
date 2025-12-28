import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-gray-100 dark:prose-pre:bg-[#1e1f20] prose-pre:rounded-xl prose-pre:border dark:prose-pre:border-[#444746] prose-code:text-sm prose-code:font-mono">
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="relative rounded-md overflow-hidden my-4">
                <div className="flex justify-between items-center px-4 py-1.5 bg-gray-200 dark:bg-[#2c2c2c] text-xs font-medium text-gray-600 dark:text-gray-300">
                  <span>{match[1]}</span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(String(children))}
                    className="hover:text-blue-500 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="!mt-0 !mb-0 !rounded-t-none bg-gray-100 dark:bg-[#1e1f20] p-4 overflow-x-auto">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code className={`${className} bg-gray-200 dark:bg-[#333] px-1.5 py-0.5 rounded text-sm`} {...props}>
                {children}
              </code>
            );
          },
          ul: ({ children }) => <ul className="list-disc pl-6 space-y-1 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 space-y-1 my-2">{children}</ol>,
          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
