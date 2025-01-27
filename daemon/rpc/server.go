package rpc

import (
	"context"
	"fmt"
	"net"
	"google.golang.org/grpc"
)

type Server struct {
	UnimplementedSwapServiceServer
	Port        string
}

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	fmt.Println("HELLO WORLD")
	fmt.Printf("Received SwapOut request: %v", req)
	return &SwapOutResponse{}, nil
}

func NewRPCServer() *Server {
	svr := &Server{}
	return svr
}

func (server *Server) ListenAndServe(port string) error {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		return fmt.Errorf("failed to listen to port: %w", err)
	}
	grpcServer := grpc.NewServer()
	RegisterSwapServiceServer(grpcServer, server)
	if err := grpcServer.Serve(listener); err != nil {
		return fmt.Errorf("failed to initialize grpc server: %w", err)
	}
	server.Port = port
	return nil
}