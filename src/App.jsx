import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Register from './Register';
import './App.css';
import './Home.css';
import Login from './Login';
import Home from './Home';
import { ThemeProvider } from './context/ThemeContext';

function App() {

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<Home />} />
        </Routes>
        <ToastContainer
          position="top-center"
          autoClose={3000}
          theme="colored"
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover

        />
    </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
