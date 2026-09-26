importScripts('ai.js');
self.onmessage = event => {
    const {id,board,level,forced}=event.data;
    const result=self.CheckersAI.chooseMove(board,level,{forced});
    self.postMessage({id,...result});
};
