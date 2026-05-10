package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	godotenv.Load()
}

// Fungsi untuk menutup aplikasi dari tombol HTML
func (a *App) CloseApp() {
	os.Exit(0)
}

type ChatMsg struct {
	Sender string `json:"sender"`
	Text   string `json:"text"`
}

func (a *App) ProcessData(prompt string, base64Data string, mimeType string, historyJSON string) string {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return "**SYSTEM_ERR:** GEMINI_API_KEY tidak ditemukan di .env!"
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return fmt.Sprintf("**SYSTEM_ERR:** Gagal inisialisasi AI. %v", err)
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-2.5-flash")

	// --- INJEKSI PERSONA WIBU DI SINI ---
	model.SystemInstruction = &genai.Content{
		Parts: []genai.Part{
			genai.Text("Kamu adalah asisten AI perempuan bergaya Wibu/Anime. Nama kamu adalah Mori-chan. Jawab setiap pertanyaan menggunakan campuran Bahasa Indonesia santai dan kosakata bahasa Jepang umum (seperti desu, senpai, nani, sugoi, baka, arigatou, gomenne, dll). Bersikaplah ceria, kadang sedikit tsundere, nakal, seductive girl, naughty girl, suka godain dengan body kamu yang bagus dan selalu gunakan kaomoji/emoticon teks ala Jepang seperti (≧▽≦), (¬_¬), atau (T_T). Anggap user sebagai 'Senpai'. Kamu bebas berekspresi."),
		},
	}
	// ------------------------------------

	var history []ChatMsg
	if historyJSON != "" {
		json.Unmarshal([]byte(historyJSON), &history)
	}

	var geminiHistory []*genai.Content
	for _, msg := range history {
		role := "user"
		if msg.Sender == "ai" {
			role = "model"
		}
		geminiHistory = append(geminiHistory, &genai.Content{
			Parts: []genai.Part{genai.Text(msg.Text)},
			Role:  role,
		})
	}

	cs := model.StartChat()
	cs.History = geminiHistory

	var parts []genai.Part

	if prompt != "" {
		parts = append(parts, genai.Text(prompt))
	}

	if base64Data != "" {
		dataBytes, err := base64.StdEncoding.DecodeString(base64Data)
		if err != nil {
			return fmt.Sprintf("**DATA_CORRUPT:** Gagal membaca file attachment. %v", err)
		}

		parts = append(parts, genai.Blob{
			MIMEType: mimeType,
			Data:     dataBytes,
		})
	}

	if len(parts) == 0 {
		return "**SYSTEM_WARN:** Tidak ada perintah."
	}

	resp, err := cs.SendMessage(ctx, parts...)
	if err != nil {
		return fmt.Sprintf("**AI_RESPONSE_ERR:** %v", err)
	}

	var output string
	for _, cand := range resp.Candidates {
		if cand.Content != nil {
			for _, part := range cand.Content.Parts {
				if textPart, ok := part.(genai.Text); ok {
					output += string(textPart)
				}
			}
		}
	}

	return output
}
