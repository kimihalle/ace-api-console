/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package service

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"strings"

	"github.com/tidwall/gjson"
)

const MaxPelicanResponseBytes = 1 << 20

// SSE envelopes and reasoning deltas can dwarf the final visible illustration.
const MaxPelicanStreamResponseBytes = 8 << 20
const MaxPelicanSVGBytes = MaxPelicanResponseBytes

// Extract only visible assistant output, never reasoning/thinking or tool results.
func PelicanResponseText(body []byte, stream bool) string {
	if !stream {
		return pelicanVisibleText(gjson.ParseBytes(body))
	}
	var text strings.Builder
	for line := range bytes.SplitSeq(body, []byte{'\n'}) {
		line = bytes.TrimSpace(line)
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		data := gjson.ParseBytes(bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:"))))
		switch data.Get("type").String() {
		case "response.output_text.delta":
			text.WriteString(data.Get("delta").String())
		case "content_block_delta":
			if data.Get("delta.type").String() == "text_delta" {
				text.WriteString(data.Get("delta.text").String())
			}
		case "response.completed":
			// Some providers send only the final response; don't duplicate deltas.
			if text.Len() == 0 {
				text.WriteString(pelicanVisibleText(data.Get("response")))
			}
		default:
			chunk := data.Get("choices.0.delta.content").String()
			if chunk == "" {
				chunk = pelicanVisibleText(data)
			}
			text.WriteString(chunk)
		}
	}
	return text.String()
}

func pelicanVisibleText(data gjson.Result) string {
	content := data.Get("choices.0.message.content")
	if content.Type == gjson.String {
		return content.String()
	}
	var text strings.Builder
	for _, path := range []string{"choices.0.message.content", "content", "output"} {
		for _, block := range data.Get(path).Array() {
			switch block.Get("type").String() {
			case "text", "output_text":
				text.WriteString(block.Get("text").String())
			case "message":
				for _, part := range block.Get("content").Array() {
					if part.Get("type").String() == "output_text" {
						text.WriteString(part.Get("text").String())
					}
				}
			}
		}
	}
	for _, part := range data.Get("candidates.0.content.parts").Array() {
		if !part.Get("thought").Bool() {
			text.WriteString(part.Get("text").String())
		}
	}
	return text.String()
}

// Extract unmodified model-authored SVG markup and reject incomplete documents.
func ExtractPelicanSVG(text string) (string, error) {
	start := strings.Index(text, "<svg")
	if start < 0 {
		return "", errors.New("no_svg")
	}
	document := text[start:]
	// Nested SVG elements are legal: only the outer root closes the document.
	decoder := xml.NewDecoder(strings.NewReader(document))
	depth := 0
	for {
		token, err := decoder.Token()
		if err != nil {
			return "", errors.New("invalid_svg")
		}
		switch token.(type) {
		case xml.StartElement:
			depth++
		case xml.EndElement:
			depth--
		}
		if depth == 0 {
			document = document[:decoder.InputOffset()]
			break
		}
		if decoder.InputOffset() > MaxPelicanSVGBytes {
			return "", errors.New("output_too_large")
		}
	}
	if len(document) > MaxPelicanSVGBytes {
		return "", errors.New("output_too_large")
	}
	if err := validatePelicanSVG(document); err != nil {
		return "", errors.New("invalid_svg")
	}
	return document, nil
}

func validatePelicanSVG(document string) error {
	decoder := xml.NewDecoder(strings.NewReader(document))
	depth := 0
	rootSeen := false
	rootClosed := false
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		switch token := token.(type) {
		case xml.StartElement:
			if depth == 0 {
				if rootSeen || rootClosed || token.Name.Local != "svg" {
					return errors.New("invalid svg root")
				}
				rootSeen = true
			}
			depth++
		case xml.EndElement:
			if depth == 0 {
				return errors.New("unexpected svg end tag")
			}
			depth--
			if depth == 0 {
				rootClosed = true
			}
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(token)) != "" {
				return errors.New("content outside svg root")
			}
		}
	}
	if !rootSeen || depth != 0 || !rootClosed {
		return errors.New("incomplete svg document")
	}
	return nil
}
