package rpc

import (
	"fmt"
	"net"

	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/swaps"
	"google.golang.org/grpc"
)

type Repository interface {
	database.SwapInRepository
	// Add more repositories here
}

type Server struct {
	UnimplementedSwapServiceServer
	Port       uint32
	Repository Repository
	grpcServer *grpc.Server
	swaps      swaps.ClientInterface
	network    Network
}

func NewRPCServer(port uint32, repository Repository, swaps *swaps.Client, network Network) *Server {
	svr := &Server{
		Port:       port,
		Repository: repository,
		grpcServer: grpc.NewServer(),
		swaps:      swaps,
		network:    network,
	}

	RegisterSwapServiceServer(svr.grpcServer, svr)

	return svr
}

func (server *Server) ListenAndServe() error {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", server.Port))
	if err != nil {
		return fmt.Errorf("failed to listen to port: %w", err)
	}

	if err := server.grpcServer.Serve(listener); err != nil {
		return fmt.Errorf("failed to initialize grpc server: %w", err)
	}

	return nil
}

func (server *Server) Stop() {
	server.grpcServer.GracefulStop()
}
