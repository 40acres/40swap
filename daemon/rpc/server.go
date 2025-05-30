package rpc

import (
	"fmt"
	"net"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/swaps"
	"google.golang.org/grpc"
)

//go:generate go tool mockgen -destination=mock_repository.go -package=rpc . Repository
type Repository interface {
	database.SwapInRepository
	// Add more repositories here
	database.SwapOutRepository
}

type Server struct {
	UnimplementedSwapServiceServer
	Port            uint32
	Repository      Repository
	grpcServer      *grpc.Server
	lightningClient lightning.Client
	swapClient      swaps.ClientInterface
	bitcoin         bitcoin.Client
	minRelayFee     int64
	network         Network
}

func NewRPCServer(port uint32, repository Repository, swapClient swaps.ClientInterface, lightningClient lightning.Client, bitcoin bitcoin.Client, minRelayFee int64, network Network) *Server {
	svr := &Server{
		Port:            port,
		Repository:      repository,
		grpcServer:      grpc.NewServer(),
		swapClient:      swapClient,
		lightningClient: lightningClient,
		bitcoin:         bitcoin,
		minRelayFee:     minRelayFee,
		network:         network,
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
