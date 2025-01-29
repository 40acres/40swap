package rpc

import (
	"context"
	"fmt"
	"net"

	log "github.com/sirupsen/logrus"
	"google.golang.org/grpc"
)

type Server struct {
	UnimplementedSwapServiceServer
	Port int
}

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	log.Info("HELLO WORLD")
	log.Infof("Received SwapOut request: %v", req)

	return &SwapOutResponse{}, nil
}

func NewRPCServer(port int) *Server {
	svr := &Server{
		Port: port,
	}

	return svr
}

func (server *Server) ListenAndServe() error {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", server.Port))
	if err != nil {
		return fmt.Errorf("failed to listen to port: %w", err)
	}
	grpcServer := grpc.NewServer()
	RegisterSwapServiceServer(grpcServer, server)
	if err := grpcServer.Serve(listener); err != nil {
		return fmt.Errorf("failed to initialize grpc server: %w", err)
	}

	return nil
}
