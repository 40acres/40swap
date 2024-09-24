alias 40swap-bitcoin-cli='docker exec --user bitcoin 40swap_bitcoind  bitcoin-cli -regtest'
alias 40swap-lsp-lncli='docker exec -it 40swap_lnd_lsp lncli -n regtest'
alias 40swap-user-lncli='docker exec -it 40swap_lnd_user lncli -n regtest'
alias 40swap-alice-lncli='docker exec -it 40swap_lnd_alice lncli -n regtest'