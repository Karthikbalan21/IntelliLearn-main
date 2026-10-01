# EDUCARE

An accessible AI learning assistant for visually impaired students. The Vite/React frontend runs on port 5173, and the Node.js API runs on port 5000.

## Start the project

Use two terminals from the project directory.

### 1. Configure and start the backend

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Open `backend/.env` and set `GROQ_API_KEY` and `GROQ_MODEL` to values from your Groq account. `TAVILY_API_KEY` is optional; without it, the assistant uses topic-only explanations. To enable generated topic illustrations, set `OPENAI_API_KEY` from your OpenAI API account. Image generation uses a separate provider and may incur charges. `OPENAI_IMAGE_MODEL` is optional and defaults to `gpt-image-2.5-flare`. Keep API keys private and do not commit `.env`.

Then start the API:

```powershell
npm run dev
```

The API should print `Server running on port 5000`. Visit `http://localhost:5000` to confirm it is running.

### 2. Start the frontend

In a second terminal, return to the project root and run:

```powershell
npm install
npm run dev
```

Open the local Vite URL printed in the terminal, usually `http://localhost:5173`.

For a production-style backend process, use `npm start` from the `backend` directory instead of `npm run dev`.
