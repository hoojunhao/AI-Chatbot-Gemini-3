# Gemini Clone

A high-fidelity replica of the Google Gemini web interface, built with React 19, Tailwind CSS, and the Google GenAI SDK. This application mirrors the look and feel of the official Gemini web app while providing real functionality through the Gemini API.

## Features

- **Model Selection**: Switch between Gemini 3 Flash, Gemini 3 Flash (Thinking Mode), and Gemini 3 Pro.
- **Thinking Mode**: Enable "High" thinking levels for complex reasoning tasks using Gemini 3 Flash.
- **Chat History**: Full sidebar functionality including creating new chats, renaming, pinning, deleting, and searching through history.
- **Multimodal Inputs**:
  - **Text**: Standard chat interface.
  - **Images**: Drag and drop or upload images for analysis.
  - **Voice (Dictation)**: Real-time speech-to-text input using the browser's Speech Recognition API.
- **Customizable Settings**:
  - System Instructions (System Prompts).
  - Temperature control (Creativity vs. Determinism).
  - Memory toggle (Context awareness).
  - Granular Safety Filters (Hate speech, harassment, etc.).
- **Theme Support**: Fully functional Dark and Light modes.
- **Markdown Rendering**: Proper syntax highlighting for code blocks and standard markdown formatting.

## Configuration

### API Key
The application requires a valid Google Gemini API key. This is expected to be available in the environment as `process.env.API_KEY`.

### Permissions
The app requests the following permissions to function fully:
- **Microphone**: For recording audio inputs (Speech-to-Text).
- **Geolocation**: For displaying the user's current city/location in the UI sidebar.

## Notes on Location

The application requests geolocation access to display your current city and state in the bottom left of the sidebar, mimicking the real Gemini interface.

**Please Note:** Currently, this location information is **purely visual**. It is displayed in the UI but is **not** sent to the Gemini model (via grounding or system context) in this version. The model is not aware of your location based on this feature.

## Project Structure

The project is organized to separate UI components, logic, and types for maintainability.

```text
/
├── components/
│   ├── App.tsx              # Main application orchestrator, layout, and state management
│   ├── MarkdownRenderer.tsx # Renders chat messages with Markdown support and syntax highlighting
│   ├── ModelSelector.tsx    # Dropdown UI for switching between Flash, Thinking, and Pro models
│   ├── SettingsModal.tsx    # Modal interface for user preferences (System prompts, safety, parameters)
│   └── Sidebar.tsx          # Navigation sidebar handling chat history, new chats, and theme toggling
├── services/
│   └── geminiService.ts     # Wrapper for @google/genai SDK to handle streaming responses and API calls
├── constants.ts             # Default configuration values (default model, safety settings, etc.)
├── index.html               # Application entry HTML including Tailwind script injection
├── index.tsx                # React root entry point
├── metadata.json            # Application metadata and permission requests
├── README.md                # Project documentation
└── types.ts                 # TypeScript definitions for Chat, Messages, and Settings
```

## Tech Stack

- **Frontend**: React 19
- **Styling**: Tailwind CSS (via CDN for portability)
- **Icons**: Lucide React
- **AI Integration**: @google/genai SDK
- **Markdown**: react-markdown
