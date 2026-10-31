package service

import (
	"errors"
	"io"
	"strings"

	"golang.org/x/net/html"
)

// ExtractPelicanHTML preserves model-authored code. Tokenization avoids
// mistaking a closing HTML tag inside JavaScript for the end of the document.
func ExtractPelicanHTML(text string) (string, error) {
	tokens := html.NewTokenizer(strings.NewReader(text))
	offset, start := 0, -1
	head, body := false, false
	for {
		kind := tokens.Next()
		position := offset
		offset += len(tokens.Raw())
		if start >= 0 && offset-start > MaxPelicanResponseBytes {
			return "", errors.New("output_too_large")
		}
		if kind == html.ErrorToken {
			if start < 0 && errors.Is(tokens.Err(), io.EOF) {
				return "", errors.New("no_html")
			}
			return "", errors.New("invalid_html")
		}
		if kind != html.StartTagToken && kind != html.EndTagToken && kind != html.DoctypeToken {
			continue
		}
		token := tokens.Token()
		if start < 0 && ((kind == html.DoctypeToken && strings.EqualFold(token.Data, "html")) || (kind == html.StartTagToken && token.Data == "html")) {
			start = position
		}
		if start < 0 {
			continue
		}
		if kind == html.StartTagToken {
			head = head || token.Data == "head"
			body = body || token.Data == "body"
		}
		if kind == html.EndTagToken && token.Data == "html" {
			if !head || !body {
				return "", errors.New("invalid_html")
			}
			return text[start:offset], nil
		}
	}
}
