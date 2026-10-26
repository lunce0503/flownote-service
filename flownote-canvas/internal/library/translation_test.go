package library

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

type dictionaryTransport func(*http.Request) (*http.Response, error)

func (f dictionaryTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func translationReply(text string) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":` + text + `}]}}]}`)), Header: make(http.Header)}
}
func TestDictionaryIncludesDistinctPartsOfSpeech(t *testing.T) {
	result, err := parseDefinitions([]byte(`{"en":[{"partOfSpeech":"adjective","definitions":[{"definition":"Derived from another."},{"definition":"Derived from another."}]},{"partOfSpeech":"noun","definitions":[{"definition":"A rate of change."},{"definition":"Something derived."}]}]}`), "derivative")
	if err != nil || len(result.Senses) != 3 || result.Senses[0].PartOfSpeech != "adjective" || result.Senses[1].PartOfSpeech != "noun" {
		t.Fatalf("lost distinct meanings: %#v %v", result, err)
	}
}
func TestKoreanTranslationIsValidatedAndCached(t *testing.T) {
	var calls atomic.Int32
	translator := NewDictionaryTranslator("test-secret", "gemini-3.1-flash-lite")
	translator.client = &http.Client{Transport: dictionaryTransport(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		if r.URL.Host != "generativelanguage.googleapis.com" || r.Header.Get("x-goog-api-key") != "test-secret" {
			t.Fatal("unsafe translation request")
		}
		return translationReply(`"[\"변화율을 나타내는 함수.\",\"다른 것에서 유래한 것.\"]"`), nil
	})}
	senses := []DictionarySense{{Definition: "A rate of change."}, {Definition: "Something derived."}}
	for range 2 {
		out, err := translator.Translate(context.Background(), "derivative", senses)
		if err != nil || len(out) != 2 || out[0] != "변화율을 나타내는 함수." {
			t.Fatal(out, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("repeated lookup charged twice", calls.Load())
	}
}
func TestTranslationRefusesEnglishOnlyOrMismatchedMeaningArrays(t *testing.T) {
	for _, response := range []string{`"[\"Still English\"]"`, `"[]"`, `"[\"한국어\",\"불필요한 뜻\"]"`, `"not json"`} {
		translator := NewDictionaryTranslator("test-secret", "gemini-3.1-flash-lite")
		translator.client = &http.Client{Transport: dictionaryTransport(func(*http.Request) (*http.Response, error) { return translationReply(response), nil })}
		if _, err := translator.Translate(context.Background(), "term", []DictionarySense{{Definition: "Definition."}}); err == nil {
			t.Fatal("accepted invalid or untranslated provider output", response)
		}
	}
	if _, err := NewDictionaryTranslator("", "").Translate(context.Background(), "word", []DictionarySense{{Definition: "Definition."}}); err == nil {
		t.Fatal("accepted missing translator credentials")
	}
}
func TestDictionaryLookupBudgetIsIndependentPerUser(t *testing.T) {
	translator := NewDictionaryTranslator("test-secret", "")
	for range 20 {
		if !translator.Allow("first") {
			t.Fatal("budget ended early")
		}
	}
	if translator.Allow("first") {
		t.Fatal("lookup budget unbounded")
	}
	if !translator.Allow("second") {
		t.Fatal("one user's budget leaked to another")
	}
}
