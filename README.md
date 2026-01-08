# ♊ Gemini Chat Clone

A high-fidelity, feature-complete replica of the Google Gemini web interface. This application is built with **React 19**, **Supabase**, and the **Google GenAI SDK**, providing a premium chat experience with real-time persistence and advanced AI capabilities.

---

## 🚀 Features

### 🧠 Advanced AI Capabilities
- **Model Selection**: Seamlessly switch between **Gemini 3 Flash**, **Gemini 3 Flash (Thinking Mode)**, and **Gemini 3 Pro**.
- **Thinking Mode**: Experience advanced reasoning with "High" thinking levels enabled for complex problem-solving.
- **System Instructions**: Define custom system prompts to guide the AI's personality and behavior.
- **Granular Parameter Control**: Adjust temperature for creativity and configure safety filters for a tailored experience.

### 💬 Rich Communication
- **Multimodal Support**: Analyze images via drag-and-drop or file upload.
- **Voice Dictation**: Built-in speech-to-text integration using the browser's Speech Recognition API.
- **Markdown Rendering**: Beautiful rendering of chat messages, including syntax-highlighted code blocks, tables, and lists.

### 🔐 Robust Infrastructure
- **Full Authentication**: Secure sign-in and sign-up with Email or **Google OAuth** via Supabase.
- **Cloud Persistence**: Your chat history, pinned conversations, and custom settings are saved and synced across devices.
- **Responsive Design**: A premium, Gemini-inspired UI that works beautifully on desktops and tablets, featuring both **Dark and Light modes**.

---

## 🛠️ Tech Stack

- **Frontend Core**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend & Auth**: [Supabase](https://supabase.com/)
- **AI Engine**: [Google Gemini (GenAI SDK)](https://ai.google.dev/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Routing**: [React Router 7](https://reactrouter.com/)

---

## ⚙️ Getting Started

### 1. Prerequisites
- Node.js (v18+)
- A Google AI Studio API Key (Get one at [aistudio.google.com](https://aistudio.google.com/))
- A Supabase Project (Create one at [supabase.com](https://supabase.com/))

### 2. Environment Variables
Create a `.env.local` file in the root directory and add the following:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Installation
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

---

## 📂 Project Structure

```text
/
├── components/          # React components (App, Sidebar, Settings, etc.)
├── contexts/            # React Contexts (Authentication)
├── services/            # API wrappers (Gemini, Supabase, Chat persistence)
├── devs/                # Development documentation and program flows
├── types.ts             # Global TypeScript definitions
├── constants.ts         # Default configurations and constants
└── index.tsx            # Main application entry point
```

For detailed logic explanations, refer to the [Program Flows](./devs/programFlows.md).

---

## 🛡️ License

This project is for educational purposes as a demonstration of the Gemini API and Supabase integration.
