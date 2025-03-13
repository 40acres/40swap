package rpc

import (
	"fmt"
	"net"

	"google.golang.org/grpc"
)

type Repository interface {
	// Add more repositories here
}

type Server struct {
	UnimplementedSwapServiceServer
	Port       uint32
	Repository Repository
}

func NewRPCServer(port uint32, repository Repository) *Server {
	svr := &Server{
		Port:       port,
		Repository: repository,
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
