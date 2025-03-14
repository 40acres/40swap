package rpc

import (
	"context"

	log "github.com/sirupsen/logrus"
)

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	log.Info("HELLO WORLD")
	log.Infof("Received SwapOut request: %v", req)

	return &SwapOutResponse{}, nil
}
