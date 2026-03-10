import React from "react"; 
 
 export default class ErrorBoundary extends React.Component< 
   { children: React.ReactNode }, 
   { hasError: boolean } 
 > { 
 
   constructor(props:any){ 
     super(props); 
     this.state = { hasError:false }; 
   } 
 
   static getDerivedStateFromError(){ 
     return { hasError:true }; 
   } 
 
   componentDidCatch(error:any,info:any){ 
     console.error("UI Error:",error,info); 
   } 
 
   render(){ 
     if(this.state.hasError){ 
       return ( 
         <div className="flex items-center justify-center h-64 text-red-500"> 
           页面加载出现错误，请刷新。 
         </div> 
       ); 
     } 
 
     return this.props.children; 
   } 
 }